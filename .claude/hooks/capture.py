#!/usr/bin/env python3
"""Append each prompt and final response to .agent-logs/<start>_<session>.md.

Wired to Claude Code hooks in .claude/settings.json:
  SessionStart     -> remember the model for this session
  UserPromptSubmit -> append PROMPT entry (verbatim prompt from hook stdin)
  Stop             -> append RESPONSE entry (final assistant text of the turn)

If a Stop arrives without a pending PROMPT (e.g. the hook was installed mid-turn),
the prompt is recovered from the transcript so the pair is never lost.
Never blocks the agent: any failure is written to .agent-logs/.capture-errors.log.
"""
import fcntl
import glob
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone

AUTHOR = "daryl-micah"
TOOL = "claude-code"
PROJECT = "undertone"


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def project_dir(data):
    return os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()


def read_transcript(path):
    entries = []
    if not path or not os.path.exists(path):
        return entries
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return entries


def content_blocks(entry):
    c = (entry.get("message") or {}).get("content")
    if isinstance(c, str):
        return [{"type": "text", "text": c}]
    return c if isinstance(c, list) else []


def is_real_prompt(entry):
    if entry.get("type") != "user" or entry.get("isMeta") or entry.get("isSidechain"):
        return False
    blocks = content_blocks(entry)
    return bool(blocks) and not any(b.get("type") == "tool_result" for b in blocks)


def prompt_text(entry):
    return "\n".join(b.get("text", "") for b in content_blocks(entry) if b.get("type") == "text")


def last_model(entries):
    for e in reversed(entries):
        if e.get("type") == "assistant" and not e.get("isSidechain"):
            m = (e.get("message") or {}).get("model")
            if m and m != "<synthetic>":
                return m
    return None


def recent_project_model(transcript_path):
    if not transcript_path:
        return None
    others = [
        p for p in glob.glob(os.path.join(os.path.dirname(transcript_path), "*.jsonl"))
        if os.path.abspath(p) != os.path.abspath(transcript_path)
    ]
    for p in sorted(others, key=os.path.getmtime, reverse=True)[:5]:
        m = last_model(read_transcript(p))
        if m:
            return m
    return None


def settings_model():
    try:
        with open(os.path.expanduser("~/.claude/settings.json")) as f:
            return json.load(f).get("model")
    except Exception:
        return None


def final_response(entries):
    """Text blocks after the last tool call of the current turn, plus model and timestamp."""
    texts, model, ts = [], None, None
    for e in reversed(entries):
        if e.get("isSidechain"):
            continue
        if is_real_prompt(e):
            break
        t = e.get("type")
        if t == "user":  # tool_result -> everything before it is intermediate
            break
        if t != "assistant":
            continue
        blocks = content_blocks(e)
        if any(b.get("type") == "tool_use" for b in blocks):
            break
        for b in reversed(blocks):
            if b.get("type") == "text" and b.get("text"):
                texts.insert(0, b["text"])
        model = model or (e.get("message") or {}).get("model")
        ts = ts or e.get("timestamp")
    return "\n\n".join(texts), model, ts


class Log:
    def __init__(self, root, session_id):
        self.dir = os.path.join(root, ".agent-logs")
        os.makedirs(self.dir, exist_ok=True)
        self.sid = session_id
        self.short = session_id[:8]
        state_dir = os.path.join(root, ".claude", "capture-state")
        os.makedirs(state_dir, exist_ok=True)
        self.state_path = os.path.join(state_dir, f"{session_id}.json")
        lock_path = os.path.join(state_dir, f"{session_id}.lock")
        self.lock = open(lock_path, "w")
        fcntl.flock(self.lock, fcntl.LOCK_EX)
        self.state = {}
        if os.path.exists(self.state_path):
            with open(self.state_path) as f:
                self.state = json.load(f)

    def save_state(self):
        with open(self.state_path, "w") as f:
            json.dump(self.state, f)

    def path(self):
        existing = glob.glob(os.path.join(self.dir, f"*_{self.sid}.md"))
        return existing[0] if existing else None

    def _render_header(self, model, first, last, n):
        return (
            "---\n"
            f"session_id: {self.sid}\n"
            f"date: {first[:10]}\n"
            f"author: {AUTHOR}\n"
            f"model: {model}\n"
            f"tool: {TOOL}\n"
            f"project: {PROJECT}\n"
            f"total_exchanges: {n}\n"
            f"first_prompt_time: {first}\n"
            f"last_prompt_time: {last}\n"
            "---\n\n"
            f"# Session Log - {first[:10]}\n\n"
            f"Session: `{self.short}` | Project: `{PROJECT}` | Author: `{AUTHOR}`\n\n"
            "---\n"
        )

    def append(self, kind, num, ts, model, body):
        path = self.path()
        if path is None:
            stamp = datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S").strftime("%Y-%m-%d_%H-%M-%S")
            path = os.path.join(self.dir, f"{stamp}_{self.sid}.md")
            self.state.setdefault("first_prompt_time", ts)
            with open(path, "w", encoding="utf-8") as f:
                f.write(self._render_header(model, ts, ts, 0))
        entry = (
            f"\n[LOG_ENTRY type={kind} num={num} session={self.short}]\n"
            f"timestamp: {ts}\n"
            f"model: {model}\n\n"
            f"{body.rstrip()}\n\n"
        )
        with open(path, "a", encoding="utf-8") as f:
            f.write(entry)

    def refresh_header(self, model):
        """Rewrite only the frontmatter counters; entries below it are never touched."""
        path = self.path()
        with open(path, encoding="utf-8") as f:
            text = f.read()
        # header = frontmatter + title block ending in '---'; keep everything after it
        idx = text.find("\n---\n", text.find("# Session Log"))
        rest = text[idx + len("\n---\n"):] if idx != -1 else ""
        header = self._render_header(
            model,
            self.state.get("first_prompt_time"),
            self.state.get("last_prompt_time"),
            self.state.get("prompts", 0),
        )
        with open(path, "w", encoding="utf-8") as f:
            f.write(header + rest)

    def log_prompt(self, text, ts, model):
        n = self.state.get("prompts", 0) + 1
        self.state["prompts"] = n
        self.state["last_prompt_time"] = ts
        self.state.setdefault("first_prompt_time", ts)
        self.state["model"] = model
        self.append("PROMPT", n, ts, model, text)
        self.refresh_header(model)
        self.save_state()


def handle(data):
    event = data.get("hook_event_name")
    sid = data.get("session_id")
    if not sid:
        return
    root = project_dir(data)
    log = Log(root, sid)
    entries = read_transcript(data.get("transcript_path"))

    if event == "SessionStart":
        if data.get("model"):
            m = data["model"]
            log.state["session_model"] = m if isinstance(m, str) else (m.get("id") or str(m))
            log.save_state()
        return

    # Hook payloads carry no model (checked on 2.1.285); the transcript is the only exact
    # source. Before this session's first reply, use the project's most recent transcript.
    model = (
        last_model(entries)
        or log.state.get("session_model")
        or recent_project_model(data.get("transcript_path"))
        or os.environ.get("ANTHROPIC_MODEL")
        or settings_model()
        or "unknown"
    )

    if event == "UserPromptSubmit":
        log.log_prompt(data.get("prompt", ""), now_iso(), model)
        return

    if event == "Stop":
        text, resp_model, _ = final_response(entries)
        if data.get("last_assistant_message"):
            text = data["last_assistant_message"]
        resp_model = resp_model or model
        # Recover a prompt the UserPromptSubmit hook never saw.
        if log.state.get("responses", 0) >= log.state.get("prompts", 0):
            last = next((e for e in reversed(entries) if is_real_prompt(e)), None)
            if last is None:
                return
            log.log_prompt(prompt_text(last), last.get("timestamp") or now_iso(), resp_model)
        n = log.state.get("prompts", 0)
        log.state["responses"] = n
        log.append("RESPONSE", n, now_iso(), resp_model, text or "(no text response)")
        log.refresh_header(resp_model)
        log.save_state()


def main():
    raw = sys.stdin.read()
    try:
        handle(json.loads(raw))
    except Exception:
        try:
            data = json.loads(raw) if raw else {}
            d = os.path.join(project_dir(data), ".agent-logs")
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, ".capture-errors.log"), "a") as f:
                f.write(f"{now_iso()}\n{traceback.format_exc()}\n")
        except Exception:
            pass
    sys.exit(0)


if __name__ == "__main__":
    main()

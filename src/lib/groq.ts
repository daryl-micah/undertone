import "server-only";

export const SUMMARY_MODEL = "openai/gpt-oss-120b";

// Free-tier Groq allows 8,000 tokens per minute, so a 429 is expected during long
// jobs, not an error: wait as long as Groq says and try again.
export async function chatJson<T>({
  system,
  user,
  schemaName,
  schema,
  maxTokens = 2500,
}: {
  system: string;
  user: string;
  schemaName: string;
  schema: object;
  maxTokens?: number;
}): Promise<T> {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");

  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        reasoning_effort: "low",
        temperature: 0.2,
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
      }),
    });

    if (res.ok) {
      const body = await res.json();
      return JSON.parse(body.choices[0].message.content) as T;
    }
    if (res.status === 429 && attempt < 8) {
      const wait = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 60) * 1000 + 250));
      continue;
    }
    throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

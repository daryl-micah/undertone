// Groq JSON chat call shared by the Next app (via groq.ts) and Node scripts.
// Plain .mjs so both can import it; no Next or server-only imports here.

export const GROQ_MODEL = "openai/gpt-oss-120b";

/**
 * One strict-JSON-schema completion. Free-tier Groq allows 8,000 tokens per
 * minute, so a 429 is expected during long jobs: wait as long as Groq says.
 * @template T
 * @param {{ apiKey?: string, system: string, user: string, schemaName: string, schema: object, maxTokens?: number }} opts
 * @returns {Promise<T>}
 */
export async function groqJson({ apiKey = process.env.GROQ_API_KEY, system, user, schemaName, schema, maxTokens = 2500 }) {
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
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
      return JSON.parse(body.choices[0].message.content);
    }
    if (res.status === 429 && attempt < 8) {
      const wait = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 60) * 1000 + 250));
      continue;
    }
    throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

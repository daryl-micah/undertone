// Small helpers for route handlers: reject malformed input with 4xx instead of
// letting Postgres or JSON.parse turn it into a 500.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string | undefined | null): id is string {
  return typeof id === "string" && UUID.test(id);
}

export const notFound = (what = "not found") => Response.json({ error: what }, { status: 404 });

/** The request's JSON body, or null if it isn't a JSON object. */
export async function readJson<T extends object>(request: Request): Promise<Partial<T> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Partial<T>) : null;
  } catch {
    return null;
  }
}

export const badBody = () => Response.json({ error: "Expected a JSON object body" }, { status: 400 });

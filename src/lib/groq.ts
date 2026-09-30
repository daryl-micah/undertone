import "server-only";
import { GROQ_MODEL, groqJson } from "./groq-core.mjs";

export const SUMMARY_MODEL = GROQ_MODEL;

export function chatJson<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: object;
  maxTokens?: number;
}): Promise<T> {
  return groqJson<T>(opts);
}

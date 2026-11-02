import type { AskAnswer } from "./ask-types";
type Entry = {
  proof: string;
  consent: string;
  expires: number;
  memory?: string;
  messages: { question: string; answer: AskAnswer }[];
};
const entries = new Map<string, Entry>();
let principal = "";
export function scopeAskMemory(user: string, company: string) {
  const next = JSON.stringify([user, company]);
  if (next !== principal) {
    entries.clear();
    principal = next;
  }
}
export function clearAskMemory(key?: string) {
  if (key) entries.delete(key);
  else entries.clear();
}
export function readAskMemory(key: string, proof: string, consent: string) {
  const e = entries.get(key);
  if (
    !e ||
    e.expires < Date.now() ||
    e.proof !== proof ||
    e.consent !== consent
  ) {
    entries.delete(key);
    return null;
  }
  return e;
}
export function writeAskMemory(key: string, entry: Entry) {
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > 4) entries.delete(entries.keys().next().value!);
}
if (typeof window !== "undefined") {
  window.addEventListener("aynor:signed-out", () => clearAskMemory());
  window.addEventListener("session-expired", () => clearAskMemory());
}

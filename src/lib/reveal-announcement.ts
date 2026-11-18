import type { FactualReveal } from "@/lib/factual-reveal";

/** Short polite live-region text after commit; excludes rationale and teaching. */
export function revealLiveSummary(reveal: FactualReveal): string {
  return `Answer submitted. Result: ${reveal.outcome}. Confidence: ${reveal.confidence}.`;
}
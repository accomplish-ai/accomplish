/**
 * Gateway types for the Accomplish LLM-Gateway integration.
 */

export interface CreditUsage {
  spentCredits: number;
  remainingCredits: number;
  totalCredits: number;
  resetsAt: string; // ISO 8601 UTC
}

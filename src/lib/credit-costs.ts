// Single source of truth for credit costs — imported by both the UI and server functions.
// Edge functions (supabase/functions/*) maintain their own local constants; keep them in sync manually.
export const CREDIT_COSTS = {
  discover: 10,
  score: 4,
  blueprint: 10,
  launch: 8,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export const PROJECT_TOTAL_CREDITS = (Object.values(CREDIT_COSTS) as number[]).reduce((a, b) => a + b, 0);

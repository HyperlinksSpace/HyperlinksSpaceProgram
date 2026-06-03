export const SMART_PURPOSE_KEYS = [
  "company",
  "agreement",
  "investment",
  "revenue",
  "partners",
] as const;

export type SmartPurposeKey = (typeof SMART_PURPOSE_KEYS)[number];

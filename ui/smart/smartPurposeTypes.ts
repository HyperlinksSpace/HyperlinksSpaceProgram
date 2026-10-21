export const SMART_PURPOSE_KEYS = [
  "owner",
  "company",
  "agreement",
  "investment",
  "partners",
] as const;

export type SmartPurposeKey = (typeof SMART_PURPOSE_KEYS)[number];

export const SMART_PURPOSE_DEFAULT: SmartPurposeKey = "owner";

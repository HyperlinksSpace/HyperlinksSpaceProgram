import { SMART_PURPOSE_KEYS, type SmartPurposeKey } from "./smartPurposeTypes";

export type SmartDeployUnit = "Gram" | "TON";

export type SmartDeployCost = {
  purpose: SmartPurposeKey;
  label: string;
  /** User-facing total charged on deploy. */
  total: number;
  /** Attached to the contract for network fees and on-chain storage. */
  fee: number;
  /** Sent to the same treasury that receives DLLR / USDT top-ups. */
  profit: number;
  unit: SmartDeployUnit;
};

/**
 * Smart panel deploy prices. Owner is quoted in Gram (native TON);
 * the other purposes use the same native asset, labeled TON in the UI.
 * `fee + profit` always equals `total`.
 */
export const SMART_DEPLOY_COSTS: Record<SmartPurposeKey, SmartDeployCost> = {
  owner: { purpose: "owner", label: "Owner", total: 5, fee: 0.5, profit: 4.5, unit: "Gram" },
  company: { purpose: "company", label: "Company", total: 10, fee: 1, profit: 9, unit: "TON" },
  agreement: {
    purpose: "agreement",
    label: "Agreement",
    total: 10,
    fee: 1,
    profit: 9,
    unit: "TON",
  },
  investment: {
    purpose: "investment",
    label: "Investment",
    total: 10,
    fee: 1,
    profit: 9,
    unit: "TON",
  },
  partners: { purpose: "partners", label: "Partners", total: 10, fee: 1, profit: 9, unit: "TON" },
};

export function listSmartDeployCosts(): SmartDeployCost[] {
  return SMART_PURPOSE_KEYS.map((key) => SMART_DEPLOY_COSTS[key]);
}

export function formatSmartDeployAmount(amount: number, unit: SmartDeployUnit): string {
  const n = Number.isInteger(amount) ? String(amount) : String(amount);
  return `${n} ${unit}`;
}

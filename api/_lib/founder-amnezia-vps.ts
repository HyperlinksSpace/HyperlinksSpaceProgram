/**
 * Live Amnezia self-hosted VPN VPS spend on GCP Compute Engine.
 *
 * - Start date: Compute Engine `creationTimestamp` only (never env).
 * - Historical days: Cloud Billing BigQuery when available.
 * - Today / unbilled gap after create: list-price burn from live instance status.
 */
import { GoogleAuth } from "google-auth-library";
import { parseGcpServiceAccountJson } from "./envelope-env.js";
import { fetchAmneziaBillingFromBigQuery } from "./founder-gcp-billing.js";

export type AmneziaVpsBreakdown = {
  source: "live" | "unavailable";
  detail: string;
  usdMonth: number;
  usdPerHour: number;
  usdToday: number;
  status: string | null;
  machineType: string | null;
  zone: string | null;
  instanceName: string;
  projectId: string;
  publicIp: string | null;
  diskGb: number;
  running: boolean;
  /** ISO timestamp from Compute Engine API only. */
  createdAt: string | null;
  /** bigquery = billed export; list_price = Compute burn; mixed = both. */
  costBasis: "bigquery" | "list_price" | "mixed" | "none";
  byDay: Array<{
    day: string;
    usd: number;
    source: "live" | "unavailable";
    /** True when USD came from Cloud Billing export (safe to subtract from GCP total). */
    fromBilling?: boolean;
  }>;
};

/** europe-west1 list prices (USD) — override via FOUNDER_AMNEZIA_*_USD_* envs. */
const DEFAULT_E2_SMALL_USD_HOUR = 0.0184;
const DEFAULT_PD_BALANCED_USD_GB_MONTH = 0.1;
const DEFAULT_EXTERNAL_IP_USD_HOUR = 0.005;
const HOURS_PER_MONTH = 730;

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function utcDayKeys(days: number): string[] {
  const out: string[] = [];
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

function parseCreatedAt(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const t = Date.parse(raw.trim());
  return Number.isFinite(t) ? new Date(t) : null;
}

/** Hours of burn on a UTC calendar day, clipped to [createdAt, now]. */
function burnHoursOnDay(day: string, createdAt: Date, now: Date): number {
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const dayEnd = dayStart + 86_400_000;
  const from = Math.max(dayStart, createdAt.getTime());
  const todayKey = now.toISOString().slice(0, 10);
  const to = day === todayKey ? Math.min(now.getTime(), dayEnd) : dayEnd;
  return Math.max(0, (to - from) / 3_600_000);
}

function machineHourlyUsd(machineType: string, zone: string): number {
  const mt = machineType.split("/").pop() ?? machineType;
  const override = envNum("FOUNDER_AMNEZIA_MACHINE_USD_HOUR", NaN);
  if (Number.isFinite(override) && override > 0) return override;
  if (mt === "e2-small" && /europe-west1/.test(zone)) return DEFAULT_E2_SMALL_USD_HOUR;
  if (mt === "e2-micro") return 0.0084;
  if (mt === "e2-medium") return 0.0336;
  if (mt === "e2-small") return DEFAULT_E2_SMALL_USD_HOUR;
  return DEFAULT_E2_SMALL_USD_HOUR;
}

function resolveTarget(): { projectId: string; zone: string; instanceName: string } {
  const parsed = parseGcpServiceAccountJson();
  const saProject =
    parsed.ok && typeof parsed.credentials.project_id === "string"
      ? parsed.credentials.project_id
      : "";
  return {
    projectId:
      process.env.FOUNDER_AMNEZIA_GCP_PROJECT?.trim() ||
      process.env.GCP_BILLING_PROJECT_ID?.trim() ||
      saProject ||
      "hyperlinksspacebot",
    zone: process.env.FOUNDER_AMNEZIA_GCP_ZONE?.trim() || "europe-west1-b",
    instanceName: process.env.FOUNDER_AMNEZIA_GCP_INSTANCE?.trim() || "amnezia-vpn",
  };
}

type ComputeInstance = {
  name?: string;
  status?: string;
  machineType?: string;
  zone?: string;
  networkInterfaces?: Array<{
    accessConfigs?: Array<{ natIP?: string; name?: string }>;
  }>;
  disks?: Array<{ diskSizeGb?: string | number; boot?: boolean }>;
  creationTimestamp?: string;
};

async function fetchInstance(
  projectId: string,
  zone: string,
  instanceName: string,
): Promise<ComputeInstance> {
  const parsed = parseGcpServiceAccountJson();
  if (!parsed.ok) {
    throw new Error(parsed.message || "GCP_SERVICE_ACCOUNT_JSON missing for Amnezia VPS probe");
  }

  const auth = new GoogleAuth({
    credentials: parsed.credentials as {
      client_email?: string;
      private_key?: string;
      project_id?: string;
    },
    scopes: ["https://www.googleapis.com/auth/compute.readonly"],
  });
  const client = await auth.getClient();
  const url = `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(
    projectId,
  )}/zones/${encodeURIComponent(zone)}/instances/${encodeURIComponent(instanceName)}`;
  const res = await client.request<ComputeInstance>({ url });
  return res.data ?? {};
}

function emptyBreakdown(
  target: { projectId: string; zone: string; instanceName: string },
  days: number,
  detail: string,
): AmneziaVpsBreakdown {
  return {
    source: "unavailable",
    detail: detail.slice(0, 280),
    usdMonth: 0,
    usdPerHour: 0,
    usdToday: 0,
    status: null,
    machineType: null,
    zone: target.zone,
    instanceName: target.instanceName,
    projectId: target.projectId,
    publicIp: null,
    diskGb: 20,
    running: false,
    createdAt: null,
    costBasis: "none",
    byDay: utcDayKeys(days).map((day) => ({ day, usd: 0, source: "unavailable" as const })),
  };
}

/**
 * Real Amnezia VPS spend: Compute creation time + BigQuery billed days + list-price for gaps.
 */
export async function fetchAmneziaVpsBreakdown(
  periodDays = 14,
): Promise<AmneziaVpsBreakdown> {
  const days = Math.max(1, Math.min(30, Math.round(periodDays)));
  const target = resolveTarget();
  const diskUsdGbMonth = envNum(
    "FOUNDER_AMNEZIA_DISK_USD_GB_MONTH",
    DEFAULT_PD_BALANCED_USD_GB_MONTH,
  );
  const ipUsdHour = envNum("FOUNDER_AMNEZIA_IP_USD_HOUR", DEFAULT_EXTERNAL_IP_USD_HOUR);

  let inst: ComputeInstance;
  try {
    inst = await fetchInstance(target.projectId, target.zone, target.instanceName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "amnezia_vps_probe_failed";
    return emptyBreakdown(target, days, msg);
  }

  const status = String(inst.status ?? "UNKNOWN");
  const running = status === "RUNNING";
  const machineType = String(inst.machineType ?? "").split("/").pop() || "e2-small";
  const zone = String(inst.zone ?? "").split("/").pop() || target.zone;
  const publicIp =
    inst.networkInterfaces?.[0]?.accessConfigs?.find((c) => c.natIP)?.natIP ?? null;
  const bootDisk = inst.disks?.find((d) => d.boot) ?? inst.disks?.[0];
  const diskGb = Math.max(1, Number(bootDisk?.diskSizeGb ?? 20) || 20);
  const createdAt = parseCreatedAt(inst.creationTimestamp);

  if (!createdAt) {
    return emptyBreakdown(
      target,
      days,
      `GCP Compute · ${target.instanceName} returned no creationTimestamp`,
    );
  }

  const cpuHour = machineHourlyUsd(machineType, zone);
  const diskMonth = diskGb * diskUsdGbMonth;
  const diskHour = diskMonth / HOURS_PER_MONTH;
  const ipHour = publicIp ? ipUsdHour : 0;
  // Disk accrues while the VM exists; CPU + external IP only while RUNNING.
  const usdPerHourRunning = round4(diskHour + cpuHour + ipHour);
  const usdPerHourStopped = round4(diskHour);
  const usdPerHour = running ? usdPerHourRunning : usdPerHourStopped;
  const usdMonthList = round4(
    diskMonth + (running ? (cpuHour + ipHour) * HOURS_PER_MONTH : 0),
  );

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const createdDay = createdAt.toISOString().slice(0, 10);
  const billed = await fetchAmneziaBillingFromBigQuery(target.instanceName, days);
  const billedByDay = new Map(
    (billed.ok ? billed.byDay : []).map((r) => [r.day, r.usd] as const),
  );

  let usedBilling = false;
  let usedList = false;
  const byDay = utcDayKeys(days).map((day) => {
    if (day < createdDay) {
      return { day, usd: 0, source: "live" as const, fromBilling: false };
    }

    const billedUsd = billedByDay.get(day);
    // Prefer actual Cloud Billing for completed days; today often lags → list price.
    if (billed.ok && billedUsd != null && day !== todayKey) {
      usedBilling = true;
      return { day, usd: round4(billedUsd), source: "live" as const, fromBilling: true };
    }
    if (billed.ok && billedUsd != null && billedUsd > 0 && day === todayKey) {
      usedBilling = true;
      return { day, usd: round4(billedUsd), source: "live" as const, fromBilling: true };
    }

    usedList = true;
    const hours = burnHoursOnDay(day, createdAt, now);
    // Today: current status rate. Prior unbilled days: full running list rate (billing lag).
    const apply = day === todayKey ? usdPerHour : usdPerHourRunning;
    return {
      day,
      usd: round4(apply * hours),
      source: "live" as const,
      fromBilling: false,
    };
  });

  const usdToday = byDay.find((r) => r.day === todayKey)?.usd ?? 0;
  const billedWindow = byDay
    .filter((r) => r.fromBilling)
    .reduce((a, r) => a + r.usd, 0);
  const usdMonth =
    billedWindow > 0
      ? round4(
          billedWindow *
            (30 / Math.max(1, byDay.filter((r) => r.fromBilling).length)),
        )
      : usdMonthList;

  const costBasis: AmneziaVpsBreakdown["costBasis"] =
    usedBilling && usedList ? "mixed" : usedBilling ? "bigquery" : usedList ? "list_price" : "none";

  const billingNote = billed.ok
    ? billed.detail
    : `billing unavailable: ${billed.detail.slice(0, 120)}`;

  return {
    source: "live",
    detail: `GCP Compute · ${target.instanceName} · ${status} · ${machineType} · ${zone}${
      publicIp ? ` · ${publicIp}` : ""
    } · created ${createdDay} · ~$${usdPerHour.toFixed(4)}/h · ~$${usdMonthList.toFixed(2)}/mo list · ${billingNote}`,
    usdMonth,
    usdPerHour,
    usdToday,
    status,
    machineType,
    zone,
    instanceName: target.instanceName,
    projectId: target.projectId,
    publicIp,
    diskGb,
    running,
    createdAt: createdAt.toISOString(),
    costBasis,
    byDay,
  };
}

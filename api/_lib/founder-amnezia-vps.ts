/**
 * Live Amnezia self-hosted VPN VPS spend on GCP Compute Engine.
 * Uses instance status + list-price burn (real-time); falls back to env monthly.
 * Daily series only attributes cost on/after the instance creation time (no backfill).
 */
import { GoogleAuth } from "google-auth-library";
import { parseGcpServiceAccountJson } from "./envelope-env.js";

export type AmneziaVpsBreakdown = {
  source: "live" | "env" | "unavailable";
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
  createdAt: string | null;
  byDay: Array<{ day: string; usd: number; source: "live" | "env" | "unavailable" }>;
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

/**
 * Per-day burn from hourly rate. Days before `createdAt` are $0 — never spread
 * monthly cost across the whole window (that invented spend before the VPS existed).
 */
function buildByDayFromBurn(
  usdPerHour: number,
  days: number,
  source: "live" | "env" | "unavailable",
  createdAt: Date | null,
): AmneziaVpsBreakdown["byDay"] {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const createdMs = createdAt?.getTime() ?? null;
  const createdDay = createdAt ? createdAt.toISOString().slice(0, 10) : null;
  const fullDayUsd = round4(usdPerHour * 24);

  return utcDayKeys(days).map((day) => {
    if (createdDay && day < createdDay) {
      return { day, usd: 0, source };
    }

    const dayStart = Date.parse(`${day}T00:00:00.000Z`);
    const dayEnd = dayStart + 86_400_000;
    const from =
      createdMs != null && createdMs > dayStart ? createdMs : dayStart;

    if (day === todayKey) {
      const hours = Math.max(0, (now.getTime() - from) / 3_600_000);
      return { day, usd: round4(usdPerHour * hours), source };
    }

    // No known start date → never invent historical spend (today handled above).
    if (!createdDay) {
      return { day, usd: 0, source };
    }

    if (day === createdDay && createdMs != null) {
      const hours = Math.max(0, (dayEnd - from) / 3_600_000);
      return { day, usd: round4(usdPerHour * hours), source };
    }

    return { day, usd: fullDayUsd, source };
  });
}

function machineHourlyUsd(machineType: string, zone: string): number {
  const mt = machineType.split("/").pop() ?? machineType;
  const override = envNum("FOUNDER_AMNEZIA_MACHINE_USD_HOUR", NaN);
  if (Number.isFinite(override) && override > 0) return override;
  // Known Amnezia VPS defaults; keep simple map for common types.
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

function envFallbackMonth(): number {
  return envNum(
    "FOUNDER_COST_AMNEZIA_VPN_USD_MONTH",
    round4(
      DEFAULT_E2_SMALL_USD_HOUR * HOURS_PER_MONTH +
        20 * DEFAULT_PD_BALANCED_USD_GB_MONTH +
        DEFAULT_EXTERNAL_IP_USD_HOUR * HOURS_PER_MONTH,
    ),
  );
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

/**
 * Real-time Amnezia VPS burn from Compute Engine status + list prices.
 */
export async function fetchAmneziaVpsBreakdown(
  periodDays = 14,
): Promise<AmneziaVpsBreakdown> {
  const days = Math.max(1, Math.min(30, Math.round(periodDays)));
  const target = resolveTarget();
  const envUsd = envFallbackMonth();
  const diskUsdGbMonth = envNum(
    "FOUNDER_AMNEZIA_DISK_USD_GB_MONTH",
    DEFAULT_PD_BALANCED_USD_GB_MONTH,
  );
  const ipUsdHour = envNum("FOUNDER_AMNEZIA_IP_USD_HOUR", DEFAULT_EXTERNAL_IP_USD_HOUR);
  const envCreatedAt = parseCreatedAt(process.env.FOUNDER_AMNEZIA_CREATED_AT);

  try {
    const inst = await fetchInstance(target.projectId, target.zone, target.instanceName);
    const status = String(inst.status ?? "UNKNOWN");
    const running = status === "RUNNING";
    const machineType = String(inst.machineType ?? "").split("/").pop() || "e2-small";
    const zone =
      String(inst.zone ?? "").split("/").pop() || target.zone;
    const publicIp =
      inst.networkInterfaces?.[0]?.accessConfigs?.find((c) => c.natIP)?.natIP ?? null;
    const bootDisk = inst.disks?.find((d) => d.boot) ?? inst.disks?.[0];
    const diskGb = Math.max(1, Number(bootDisk?.diskSizeGb ?? 20) || 20);
    const createdAt =
      parseCreatedAt(inst.creationTimestamp) ?? envCreatedAt;

    const cpuHour = machineHourlyUsd(machineType, zone);
    const diskMonth = diskGb * diskUsdGbMonth;
    const diskHour = diskMonth / HOURS_PER_MONTH;
    const ipHour = publicIp ? ipUsdHour : 0;
    const usdPerHour = round4(diskHour + (running ? cpuHour + ipHour : 0));
    const usdMonth = round4(
      diskMonth + (running ? (cpuHour + ipHour) * HOURS_PER_MONTH : 0),
    );

    const byDay = buildByDayFromBurn(usdPerHour, days, "live", createdAt);
    const todayKey = new Date().toISOString().slice(0, 10);
    const usdToday = byDay.find((r) => r.day === todayKey)?.usd ?? 0;

    return {
      source: "live",
      detail: `GCP Compute · ${target.instanceName} · ${status} · ${machineType} · ${zone}${
        publicIp ? ` · ${publicIp}` : ""
      } · ~$${usdPerHour.toFixed(4)}/h · ~$${usdMonth.toFixed(2)}/mo list${
        createdAt ? ` · since ${createdAt.toISOString().slice(0, 10)}` : ""
      }`,
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
      createdAt: createdAt?.toISOString() ?? null,
      byDay,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "amnezia_vps_probe_failed";
    if (envUsd > 0) {
      const usdPerHour = round4(envUsd / HOURS_PER_MONTH);
      const byDay = buildByDayFromBurn(usdPerHour, days, "env", envCreatedAt);
      const todayKey = new Date().toISOString().slice(0, 10);
      const usdToday = byDay.find((r) => r.day === todayKey)?.usd ?? 0;
      return {
        source: "env",
        detail: `${msg.slice(0, 160)} · using FOUNDER_COST_AMNEZIA_VPN_USD_MONTH${
          envCreatedAt
            ? ` · since ${envCreatedAt.toISOString().slice(0, 10)}`
            : " · today only (set FOUNDER_AMNEZIA_CREATED_AT for history)"
        }`,
        usdMonth: envUsd,
        usdPerHour,
        usdToday,
        status: null,
        machineType: null,
        zone: target.zone,
        instanceName: target.instanceName,
        projectId: target.projectId,
        publicIp: null,
        diskGb: 20,
        running: false,
        createdAt: envCreatedAt?.toISOString() ?? null,
        byDay,
      };
    }
    return {
      source: "unavailable",
      detail: msg.slice(0, 220),
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
      byDay: utcDayKeys(days).map((day) => ({ day, usd: 0, source: "unavailable" as const })),
    };
  }
}

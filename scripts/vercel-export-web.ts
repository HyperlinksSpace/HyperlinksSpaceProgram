import { execSync } from "node:child_process";

function readDeployVersion(): string {
  const output = execSync("npx tsx scripts/stamp-deploy-version.ts", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
  return line && line.length > 0 ? line : "0";
}

/** Vercel injects `--max_old_space_size=8192` (underscores). Do not stack a second limit. */
function normalizeNodeOptionsForMetroExport(raw: string): string {
  const withoutHeap = raw.replace(/\s*--max[-_]old[-_]space[-_]size=\d+\b/gi, "").trim();
  // Metro's transform worker inherits NODE_OPTIONS. On an 8 GB builder, a 7 GB
  // heap on both the parent and the worker swaps the machine to a halt around
  // 95–98% of the web bundle. Two ~3 GB heaps fit; one worker is passed via CLI.
  const heapMb = process.env.VERCEL ? "3072" : "6144";
  return `${withoutHeap} --max-old-space-size=${heapMb}`.trim();
}

const deployVersion = readDeployVersion();
const nodeOptions = normalizeNodeOptionsForMetroExport(process.env.NODE_OPTIONS ?? "");
const metroMaxWorkers = process.env.METRO_MAX_WORKERS ?? (process.env.VERCEL ? "1" : "4");
const env = {
  ...process.env,
  NODE_OPTIONS: nodeOptions,
  // Expo export does not read this env var; `--max-workers` below is what Metro uses.
  // Kept so the log line still shows the intended cap.
  METRO_MAX_WORKERS: metroMaxWorkers,
  CI: process.env.CI ?? "1",
  EXPO_NO_TELEMETRY: process.env.EXPO_NO_TELEMETRY ?? "1",
  EXPO_PUBLIC_DEPLOY_VERSION: deployVersion,
  EXPO_PUBLIC_VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID?.trim() ?? "",
};

console.log(
  `[vercel-export] EXPO_PUBLIC_DEPLOY_VERSION=${deployVersion} deploymentId=${env.EXPO_PUBLIC_VERCEL_DEPLOYMENT_ID || "(none)"} nodeOptions=${env.NODE_OPTIONS} metroMaxWorkers=${env.METRO_MAX_WORKERS}`,
);

execSync(
  `npx expo export -p web --output-dir .vercel/output/static --max-workers ${metroMaxWorkers}`,
  {
    env,
    stdio: "inherit",
  },
);

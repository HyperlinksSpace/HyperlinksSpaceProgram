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
  // Leave ~1 GB for Metro workers / OS on Vercel's 8 GB builders.
  const heapMb = process.env.VERCEL ? "7168" : "6144";
  return `${withoutHeap} --max-old-space-size=${heapMb}`.trim();
}

const deployVersion = readDeployVersion();
const nodeOptions = normalizeNodeOptionsForMetroExport(process.env.NODE_OPTIONS ?? "");
const env = {
  ...process.env,
  NODE_OPTIONS: nodeOptions,
  // Parallel Metro workers + dual web/λ bundles have frozen this app at ~98% on 8 GB VMs.
  // Single worker on Vercel avoids intermittent Web bundle stalls at ~95–98% (8 GB builders).
  METRO_MAX_WORKERS: process.env.METRO_MAX_WORKERS ?? (process.env.VERCEL ? "1" : "4"),
  CI: process.env.CI ?? "1",
  EXPO_NO_TELEMETRY: process.env.EXPO_NO_TELEMETRY ?? "1",
  EXPO_PUBLIC_DEPLOY_VERSION: deployVersion,
  EXPO_PUBLIC_VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID?.trim() ?? "",
};

console.log(
  `[vercel-export] EXPO_PUBLIC_DEPLOY_VERSION=${deployVersion} deploymentId=${env.EXPO_PUBLIC_VERCEL_DEPLOYMENT_ID || "(none)"} nodeOptions=${env.NODE_OPTIONS} metroMaxWorkers=${env.METRO_MAX_WORKERS}`,
);

execSync("npx expo export -p web --output-dir .vercel/output/static", {
  env,
  stdio: "inherit",
});

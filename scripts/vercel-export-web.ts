import { execSync } from "node:child_process";

function readDeployVersion(): string {
  const output = execSync("npx tsx scripts/stamp-deploy-version.ts", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
  return line && line.length > 0 ? line : "0";
}

const deployVersion = readDeployVersion();
const existingNodeOptions = process.env.NODE_OPTIONS ?? "";
const env = {
  ...process.env,
  // Vercel build VMs are 8 GB. Metro has frozen at ~98% on this app, then the
  // CLI/API canceled after ~10 min of silence. Keep a 6 GB heap for export.
  NODE_OPTIONS: /\b--max-old-space-size=/.test(existingNodeOptions)
    ? existingNodeOptions
    : `${existingNodeOptions} --max-old-space-size=6144`.trim(),
  CI: process.env.CI ?? "1",
  EXPO_NO_TELEMETRY: process.env.EXPO_NO_TELEMETRY ?? "1",
  EXPO_PUBLIC_DEPLOY_VERSION: deployVersion,
  EXPO_PUBLIC_VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID?.trim() ?? "",
};

console.log(
  `[vercel-export] EXPO_PUBLIC_DEPLOY_VERSION=${deployVersion} deploymentId=${env.EXPO_PUBLIC_VERCEL_DEPLOYMENT_ID || "(none)"} nodeOptions=${env.NODE_OPTIONS}`,
);

execSync("npx expo export -p web --output-dir .vercel/output/static", {
  env,
  stdio: "inherit",
});

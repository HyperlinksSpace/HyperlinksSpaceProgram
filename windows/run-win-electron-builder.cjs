/**
 * Runs electron-builder --win with BUILD_STAMP, per-build output under releases/builder/<id>/eb-output/,
 * then cleanup.cjs in the same process env (so HSP_EB_OUTPUT is not lost between shells).
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { RELEASE_BUILD_DEV_DIRNAME, resolveBuildLayout, ensureCleanEbOutput } = require("./build-layout.cjs");

const appDir = path.join(__dirname, "..");
const ebCli = require.resolve("electron-builder/cli.js");

function relForConfig(p) {
  return path.relative(appDir, p).split(path.sep).join("/");
}

const layout = resolveBuildLayout(appDir);
ensureCleanEbOutput(layout.ebOutputDir);

const outArg = `--config.directories.output=${relForConfig(layout.ebOutputDir)}`;
const env = {
  ...process.env,
  BUILD_STAMP: layout.buildStamp,
  RELEASE_BUILD_ID: layout.buildName,
  HSP_EB_OUTPUT: relForConfig(layout.ebOutputDir),
};

console.log(`[win-eb] build=${layout.buildName} stamp=${layout.buildStamp}`);
console.log(`[win-eb] staging → ${relForConfig(layout.ebOutputDir)} (removed after cleanup)`);
console.log(`[win-eb] final → releases/builder/${layout.buildName}/<installer>.exe + ${RELEASE_BUILD_DEV_DIRNAME}/`);

const r = spawnSync(process.execPath, [ebCli, "--win", "--publish", "never", outArg], {
  cwd: appDir,
  env,
  stdio: "inherit",
});

if (r.status !== 0) {
  process.exit(r.status === null ? 1 : r.status);
}

const c = spawnSync(process.execPath, [path.join(__dirname, "cleanup.cjs")], {
  cwd: appDir,
  env,
  stdio: "inherit",
});
process.exit(c.status === null ? 1 : c.status);

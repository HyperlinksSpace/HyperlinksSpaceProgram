const { spawn } = require("child_process");
const path = require("path");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function makeBuildStamp(d = new Date()) {
  return `${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${d.getFullYear()}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

function computeBuildStamp() {
  if (process.env.BUILD_STAMP?.trim()) return process.env.BUILD_STAMP.trim();
  const rid = process.env.RELEASE_BUILD_ID?.trim();
  if (rid) {
    const m = rid.match(/^build_(\d{8}_\d{4})_forge$/);
    if (m) return m[1];
  }
  return makeBuildStamp();
}

function run() {
  const appDir = path.resolve(__dirname, "..", "..");
  const isVerbose = process.argv.includes("--verbose");
  const cliPath = path.join(appDir, "node_modules", "@electron-forge", "cli", "dist", "electron-forge.js");

  const BUILD_STAMP = computeBuildStamp();

  const env = {
    ...process.env,
    BUILD_STAMP,
  };

  const args = [cliPath, "make", "--platform", "win32"];
  if (isVerbose) args.push("--verbose");

  console.log(`[forge] BUILD_STAMP=${env.BUILD_STAMP}`);
  console.log(`[forge] node ${args.join(" ")}`);

  const child = spawn(process.execPath, args, {
    cwd: appDir,
    env,
    stdio: "inherit",
    shell: false,
  });

  child.on("close", (code) => {
    if (code !== 0) {
      process.exit(code || 1);
      return;
    }
    const cleanupPath = path.join(appDir, "windows", "forge-cleanup.cjs");
    const c = spawn(process.execPath, [cleanupPath], {
      cwd: appDir,
      env: { ...process.env, BUILD_STAMP },
      stdio: "inherit",
      shell: false,
    });
    c.on("close", (c2) => process.exit(c2 || 0));
    c.on("error", () => process.exit(1));
  });
  child.on("error", () => process.exit(1));
}

run();

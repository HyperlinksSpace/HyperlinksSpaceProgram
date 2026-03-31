/**
 * Runs electron-builder --win and shows a terminal progress bar during the 7z compression step.
 * Usage: node windows/build-with-progress.cjs [--pack] [--verbose]
 *   --pack     Skip "npm run build", run only electron-builder (pack:win style).
 *   --verbose  Add DEBUG=electron-builder.
 */
const { spawn } = require("child_process");
const path = require("path");

const appDir = path.join(__dirname, "..");
const isPack = process.argv.includes("--pack");
const isVerbose = process.argv.includes("--verbose");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function makeBuildStamp(d = new Date()) {
  return `${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${d.getFullYear()}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

// 7z step: electron-builder runs 7za with -bd (no progress output), so we estimate by time.
const ESTIMATED_7Z_SECONDS = 100;
const PROGRESS_BAR_WIDTH = 24;

let progressInterval = null;
let progressStartTime = null;

function startProgressBar() {
  if (progressStartTime !== null) return;
  progressStartTime = Date.now();
  progressInterval = setInterval(() => {
    const elapsed = (Date.now() - progressStartTime) / 1000;
    const pct = Math.min(95, Math.floor((elapsed / ESTIMATED_7Z_SECONDS) * 95));
    const filled = Math.round((pct / 100) * PROGRESS_BAR_WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(PROGRESS_BAR_WIDTH - filled);
    process.stdout.write(`\r  Compressing installer  ${String(pct).padStart(3)}% [${bar}]  `);
  }, 500);
}

function stopProgressBar(finalPct = 100) {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  if (progressStartTime !== null) {
    progressStartTime = null;
    const filled = Math.round((finalPct / 100) * PROGRESS_BAR_WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(PROGRESS_BAR_WIDTH - filled);
    process.stdout.write(`\r  Compressing installer  ${String(finalPct).padStart(3)}% [${bar}]  \n`);
  }
}

function run(command, args, opts) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...(opts?.env || {}) };
    if (isVerbose) env.DEBUG = "electron-builder";
    const usePipe = opts && opts.pipeOutput;
    const child = spawn(command, args, {
      cwd: appDir,
      env,
      stdio: usePipe ? ["inherit", "pipe", "pipe"] : "inherit",
      shell: true,
      ...opts,
    });
    if (!usePipe) {
      child.on("close", (code) => {
        if (code !== 0) reject(new Error(`Exit ${code}`));
        else resolve();
      });
      child.on("error", reject);
      return;
    }
    child.stdout.on("data", (chunk) => {
      const s = chunk.toString();
      process.stdout.write(s);
      if (/7za\.exe|executing.*7z|\.nsis\.7z/.test(s)) startProgressBar();
    });
    child.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      process.stderr.write(s);
      if (/7za\.exe|executing.*7z|\.nsis\.7z/.test(s)) startProgressBar();
    });
    child.on("close", (code, signal) => {
      stopProgressBar();
      if (code !== 0) reject(new Error(`Exit ${code}`));
      else resolve();
    });
    child.on("error", (err) => {
      stopProgressBar();
      reject(err);
    });
  });
}

(async () => {
  try {
    const buildStamp = process.env.BUILD_STAMP || makeBuildStamp();
    if (!isPack) {
      console.log("Running: npm run build\n");
      await run("npm", ["run", "build"], { stdio: "inherit" });
    }
    // Never publish from this script: CI has no GH_TOKEN unless set, and releases are created via gh workflow + cleanup (latest.yml).
    console.log(`\nBuild stamp: ${buildStamp}`);
    console.log("Running: electron-builder --win --publish never\n");
    await run("npx", ["electron-builder", "--win", "--publish", "never"], {
      pipeOutput: true,
      env: { BUILD_STAMP: buildStamp },
    });
    console.log("\nRunning: windows/cleanup.cjs\n");
    await run("node", [path.join(__dirname, "cleanup.cjs")]);
  } catch (e) {
    stopProgressBar();
    process.exit(1);
  }
})();

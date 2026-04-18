/**
 * Runs electron-builder --win with stable pass-through logging.
 * Usage: node windows/build-with-progress.cjs [--pack] [--verbose]
 *   --pack     Skip "npm run build", run only electron-builder (pack:win style).
 *   --verbose  Add DEBUG=electron-builder.
 */
const { spawn } = require("child_process");
const path = require("path");
const { resolveBuildLayout, ensureCleanEbOutput } = require("./build-layout.cjs");

const appDir = path.join(__dirname, "..");
const isPack = process.argv.includes("--pack");
const isVerbose = process.argv.includes("--verbose");

const ebCli = require.resolve("electron-builder/cli.js");

function relForConfig(p) {
  return path.relative(appDir, p).split(path.sep).join("/");
}

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const { pipeOutput: usePipe, env: optsEnv, shell = true } = opts;
    const env = { ...process.env, ...(optsEnv || {}) };
    if (isVerbose) env.DEBUG = "electron-builder";
    const child = spawn(command, args, {
      cwd: appDir,
      env,
      stdio: usePipe ? ["inherit", "pipe", "pipe"] : "inherit",
      shell,
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
    });
    child.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      process.stderr.write(s);
    });
    child.on("close", (code, signal) => {
      if (code !== 0) reject(new Error(`Exit ${code}`));
      else resolve();
    });
    child.on("error", (err) => {
      reject(err);
    });
  });
}

(async () => {
  try {
    if (!isPack) {
      console.log("Running: npm run build\n");
      await run("npm", ["run", "build"], { stdio: "inherit" });
    }
    const layout = resolveBuildLayout(appDir);
    ensureCleanEbOutput(layout.ebOutputDir);
    const outArg = `--config.directories.output=${relForConfig(layout.ebOutputDir)}`;
    const ebEnv = {
      ...process.env,
      BUILD_STAMP: layout.buildStamp,
      RELEASE_BUILD_ID: layout.buildName,
      HSP_EB_OUTPUT: relForConfig(layout.ebOutputDir),
    };
    if (isVerbose) ebEnv.DEBUG = "electron-builder";
    // Never publish from this script: CI has no GH_TOKEN unless set, and releases are created via gh workflow + cleanup (latest.yml).
    console.log(`\nBuild: ${layout.buildName}  stamp: ${layout.buildStamp}`);
    console.log(`Output: ${relForConfig(layout.ebOutputDir)}`);
    console.log("Running: electron-builder --win --publish never\n");
    await run(process.execPath, [ebCli, "--win", "--publish", "never", outArg], {
      pipeOutput: true,
      env: ebEnv,
      shell: false,
    });
    console.log("\nRunning: windows/cleanup.cjs\n");
    await run("node", [path.join(__dirname, "cleanup.cjs")], { env: ebEnv });
  } catch (e) {
    process.exit(1);
  }
})();

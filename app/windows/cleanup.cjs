/**
 * Final layout under releases/builder/<build_id>/:
 *   HyperlinksSpaceAppInstaller_<stamp>.exe   (root — only distributable at top level)
 *   dev/                                      (all other build artifacts)
 * Staging (eb-output or releases/artifacts) is removed after this script runs.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { RELEASE_BUILD_DEV_DIRNAME } = require("./build-layout.cjs");

const appDir = path.join(__dirname, "..");
const releasesDir = path.join(appDir, "releases");
const legacyReleaseDir = path.join(appDir, "release");
/** Per-build electron-builder staging (set by run-win-electron-builder / build-with-progress); else legacy global. */
const artifactsDir = process.env.HSP_EB_OUTPUT?.trim()
  ? path.resolve(appDir, process.env.HSP_EB_OUTPUT.trim())
  : path.join(releasesDir, "artifacts");

// build_MMDDYYYY_HHMM — optional override for CI (must match build_* pattern)
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const envBuildId = process.env.RELEASE_BUILD_ID?.trim();
const defaultBuildName =
  "build_" +
  pad(now.getMonth() + 1) +
  pad(now.getDate()) +
  now.getFullYear() +
  "_" +
  pad(now.getHours()) +
  pad(now.getMinutes());
const buildName =
  envBuildId && /^build_\d{8}_\d{4}$/.test(envBuildId) ? envBuildId : defaultBuildName;

// releases/builder/build_MMDDYYYY_HHMM — installer only at root; everything else under dev/
const buildDir = path.join(releasesDir, "builder", buildName);
const devDir = path.join(buildDir, RELEASE_BUILD_DEV_DIRNAME);

/** Required for electron-updater (GitHub) — must be uploaded next to the installer on each release. */
const latestYmlName = "latest.yml";
const zipLatestYmlName = "zip-latest.yml";
const devArtifacts = [
  "win-unpacked",
  "builder-debug.yml",
  "builder-effective-config.yaml",
];

function pickInstallerName() {
  const files = fs.readdirSync(artifactsDir);
  const candidates = files.filter((f) => /^HyperlinksSpaceAppInstaller(?:_\d{8}_\d{4})?\.exe$/i.test(f));
  if (candidates.length === 0) return null;
  // Prefer timestamped file if both legacy/static and stamped files exist.
  candidates.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return candidates[0];
}

function pickZipName() {
  const files = fs.readdirSync(artifactsDir);
  const candidates = files.filter((f) => /^HyperlinksSpaceApp_[\d.]+\.zip$/i.test(f));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.localeCompare(a));
  return candidates[0];
}

function moveIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  try {
    fs.renameSync(src, dest);
    console.log("Moved:", path.relative(artifactsDir, src));
    return true;
  } catch (e) {
    try {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
        fs.rmSync(src, { recursive: true });
      } else {
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      }
      console.log("Moved (copy+delete):", path.relative(artifactsDir, src));
      return true;
    } catch (e2) {
      console.warn("Could not move", src, e2.message);
      return false;
    }
  }
}

/** Anything electron-builder left behind (zip blockmaps, nsis temps, etc.) → dev/ */
function moveRemainingStagingToDev() {
  if (!fs.existsSync(artifactsDir)) return;
  let names;
  try {
    names = fs.readdirSync(artifactsDir);
  } catch (_) {
    return;
  }
  for (const name of names) {
    const src = path.join(artifactsDir, name);
    const dest = path.join(devDir, name);
    if (!fs.existsSync(src)) continue;
    try {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn("Could not clear dev target", dest, e?.message || e);
      continue;
    }
    moveIfExists(src, dest);
  }
}

const exeName = pickInstallerName();
if (!exeName) {
  console.warn(`No installer in ${path.relative(appDir, artifactsDir)}/. Run electron-builder first.`);
  process.exit(1);
}
const exeSrc = path.join(artifactsDir, exeName);

fs.mkdirSync(devDir, { recursive: true });

// Installer at build folder root only
const exeDest = path.join(buildDir, exeName);
moveIfExists(exeSrc, exeDest);

const latestSrc = path.join(artifactsDir, latestYmlName);
const latestDest = path.join(devDir, latestYmlName);
if (!moveIfExists(latestSrc, latestDest)) {
  console.warn(`No latest.yml in ${path.relative(appDir, artifactsDir)}/ — generating one for electron-updater.`);
}

/** NSIS update metadata; electron-builder sometimes omits this unless publishing. */
function writeLatestYmlForExe(exePath, ymlPath) {
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  const version = String(pkg.version ?? "0.0.0");
  const exeFileName = path.basename(exePath);
  const buf = fs.readFileSync(exePath);
  const sha512 = crypto.createHash("sha512").update(buf).digest("base64");
  const size = buf.length;
  const releaseDate = new Date().toISOString();
  const yml =
    `version: ${version}\n` +
    `files:\n` +
    `  - url: ${exeFileName}\n` +
    `    sha512: ${sha512}\n` +
    `    size: ${size}\n` +
    `path: ${exeFileName}\n` +
    `sha512: ${sha512}\n` +
    `releaseDate: '${releaseDate}'\n`;
  fs.writeFileSync(ymlPath, yml, "utf8");
  console.log("Wrote:", path.relative(appDir, ymlPath));
}

if (fs.existsSync(exeDest) && !fs.existsSync(latestDest)) {
  writeLatestYmlForExe(exeDest, latestDest);
}

const zipName = pickZipName();
const zipDest = zipName ? path.join(devDir, zipName) : null;
const zipLatestDest = path.join(devDir, zipLatestYmlName);
if (zipName) {
  moveIfExists(path.join(artifactsDir, zipName), zipDest);
}
if (zipDest && fs.existsSync(zipDest)) {
  writeLatestYmlForExe(zipDest, zipLatestDest);
}

// Move optional/debug artifacts into dev/
for (const name of devArtifacts) {
  const src = path.join(artifactsDir, name);
  const dest = path.join(devDir, name);
  moveIfExists(src, dest);
}
const blockmapName = `${exeName}.blockmap`;
moveIfExists(path.join(artifactsDir, blockmapName), path.join(devDir, blockmapName));

moveRemainingStagingToDev();

// Remove electron-builder staging (eb-output or legacy releases/artifacts).
try {
  if (fs.existsSync(legacyReleaseDir)) {
    fs.rmSync(legacyReleaseDir, { recursive: true, force: true });
    console.log("Removed release/ (legacy)");
  }
  if (fs.existsSync(artifactsDir)) {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
    const label = process.env.HSP_EB_OUTPUT?.trim() ? "eb-output" : "releases/artifacts";
    console.log(`Removed ${label}/`);
  }
} catch (_) {}

console.log("Output:", path.join("releases", "builder", buildName));

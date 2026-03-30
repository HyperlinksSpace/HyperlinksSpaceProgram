/**
 * After Electron Forge `make`, mirrors builder cleanup layout under
 * `releases/forge/build_MMDDYYYY_HHMM_forge/` — installer only at root; zip, yml, unpacked, etc. in dev/.
 * CI sets RELEASE_BUILD_ID=build_<date>_forge; locally the id defaults to the same pattern.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { RELEASE_BUILD_DEV_DIRNAME } = require("./build-layout.cjs");

const appDir = path.join(__dirname, "..");
const releasesDir = path.join(appDir, "releases");
const forgeArtifactsRoot = path.join(releasesDir, "forge", "artifacts");

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();

const defaultBuildNameFromClock =
  "build_" +
  pad(now.getMonth() + 1) +
  pad(now.getDate()) +
  now.getFullYear() +
  "_" +
  pad(now.getHours()) +
  pad(now.getMinutes()) +
  "_forge";

const envBuildId = process.env.RELEASE_BUILD_ID?.trim();
// Parent `make-with-stamp.cjs` passes BUILD_STAMP so folder name matches the installer stamp.
const stampFromEnv = process.env.BUILD_STAMP?.trim();
const buildName =
  envBuildId && /^build_\d{8}_\d{4}_forge$/.test(envBuildId)
    ? envBuildId
    : stampFromEnv
      ? `build_${stampFromEnv}_forge`
      : defaultBuildNameFromClock;

const buildDir = path.join(releasesDir, "forge", buildName);
const devDir = path.join(buildDir, RELEASE_BUILD_DEV_DIRNAME);

const latestYmlName = "latest.yml";
const zipLatestYmlName = "zip-latest.yml";

function walkDirs(dir, fn) {
  if (!fs.existsSync(dir)) return;
  const st = fs.statSync(dir);
  if (!st.isDirectory()) return;
  fn(dir);
  for (const name of fs.readdirSync(dir)) {
    walkDirs(path.join(dir, name), fn);
  }
}

function collectFiles(root, predicate) {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (predicate(p, name)) out.push(p);
    }
  }
  walk(root);
  return out;
}

function pickInstallerExe() {
  const exes = collectFiles(
    forgeArtifactsRoot,
    (p, name) =>
      p.replace(/\\/g, "/").toLowerCase().includes("/make/") &&
      name.toLowerCase().endsWith(".exe"),
  );
  if (exes.length === 0) return null;
  for (const f of exes) {
    const b = path.basename(f).toLowerCase();
    if (b.includes("setup") || b.includes("installer")) return f;
  }
  return exes[0];
}

function pickZip() {
  const zips = collectFiles(
    forgeArtifactsRoot,
    (p, name) =>
      p.replace(/\\/g, "/").toLowerCase().includes("/make/") &&
      name.toLowerCase().endsWith(".zip"),
  );
  if (zips.length === 0) return null;
  return zips[0];
}

function pickYml(name) {
  const ymls = collectFiles(
    forgeArtifactsRoot,
    (p, n) =>
      p.replace(/\\/g, "/").toLowerCase().includes("/make/") &&
      n.toLowerCase() === name,
  );
  return ymls[0] || null;
}

function findUnpackedDir() {
  let found = null;
  walkDirs(forgeArtifactsRoot, (d) => {
    if (found) return;
    const base = path.basename(d);
    if (!base.endsWith("-win32-x64")) return;
    const exeCandidates = fs.readdirSync(d).filter((n) => n.toLowerCase().endsWith(".exe"));
    if (exeCandidates.length > 0) found = d;
  });
  return found;
}

function moveIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  try {
    fs.renameSync(src, dest);
    console.log("Moved:", path.relative(appDir, dest));
    return true;
  } catch (e) {
    try {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
        fs.rmSync(src, { recursive: true, force: true });
      } else {
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      }
      console.log("Moved (copy+delete):", path.relative(appDir, dest));
      return true;
    } catch (e2) {
      console.warn("Could not move", src, e2.message);
      return false;
    }
  }
}

function stampFromBuildId(name) {
  const m = name.match(/^build_(\d{8}_\d{4})_forge$/);
  return m ? m[1] : null;
}

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

function main() {
  if (!fs.existsSync(forgeArtifactsRoot)) {
    console.warn("No Forge output at releases/forge/artifacts/. Run forge make first.");
    process.exit(1);
  }

  const stamp =
    process.env.BUILD_STAMP?.trim() || stampFromBuildId(buildName);

  if (!stamp) {
    console.warn("Could not determine BUILD_STAMP (set env or use build_*_forge id).");
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  const version = String(pkg.version ?? "0.0.0");
  const targetExeName = `HyperlinksSpaceAppInstaller_${stamp}.exe`;
  const targetZipName = `HyperlinksSpaceApp_${version}.zip`;

  const exeSrc = pickInstallerExe();
  if (!exeSrc) {
    console.warn("No installer .exe under releases/forge/artifacts/**/make/**");
    process.exit(1);
  }

  fs.mkdirSync(devDir, { recursive: true });

  const exeDest = path.join(buildDir, targetExeName);
  moveIfExists(exeSrc, exeDest);

  const latestSrc = pickYml(latestYmlName);
  const latestDest = path.join(devDir, latestYmlName);
  if (latestSrc) {
    moveIfExists(latestSrc, latestDest);
  }
  if (fs.existsSync(exeDest) && !fs.existsSync(latestDest)) {
    console.warn("No latest.yml from Forge — generating for electron-updater.");
    writeLatestYmlForExe(exeDest, latestDest);
  } else if (fs.existsSync(exeDest) && fs.existsSync(latestDest)) {
    // ensure consistent
  }

  const zipSrc = pickZip();
  if (!zipSrc) {
    console.error(
      "No portable .zip under releases/forge/artifacts/**/make/** — ensure @electron-forge/maker-zip is enabled.",
    );
    process.exit(1);
  }
  const zipDest = path.join(devDir, targetZipName);
  moveIfExists(zipSrc, zipDest);

  const zipLatestDest = path.join(devDir, zipLatestYmlName);
  const zipLatestSrc = pickYml(zipLatestYmlName);
  if (zipLatestSrc) {
    moveIfExists(zipLatestSrc, zipLatestDest);
  } else if (fs.existsSync(zipDest)) {
    writeLatestYmlForExe(zipDest, zipLatestDest);
  }

  const unpacked = findUnpackedDir();
  if (unpacked) {
    const destUnpacked = path.join(devDir, "win-unpacked");
    fs.mkdirSync(devDir, { recursive: true });
    if (fs.existsSync(destUnpacked)) fs.rmSync(destUnpacked, { recursive: true, force: true });
    fs.cpSync(unpacked, destUnpacked, { recursive: true });
    console.log("Copied unpacked →", path.relative(appDir, destUnpacked));
    fs.rmSync(unpacked, { recursive: true, force: true });
  }

  const blockmaps = collectFiles(forgeArtifactsRoot, (_, n) => n.toLowerCase().endsWith(".blockmap"));
  for (const bm of blockmaps) {
    moveIfExists(bm, path.join(devDir, path.basename(bm)));
  }

  try {
    const forgeStaging = path.join(releasesDir, "forge", "artifacts");
    if (fs.existsSync(forgeStaging)) {
      fs.rmSync(forgeStaging, { recursive: true, force: true });
      console.log("Removed releases/forge/artifacts/");
    }
  } catch (_) {}

  console.log("Output:", path.join("releases", "forge", buildName));
}

main();

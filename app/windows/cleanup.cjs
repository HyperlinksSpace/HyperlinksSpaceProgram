const fs = require("fs");
const path = require("path");

const appDir = path.join(__dirname, "..");
const releaseDir = path.join(appDir, "release");
const releasesDir = path.join(appDir, "releases");

// build_MMDDYYYY_HHMM
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const buildName =
  "build_" +
  pad(now.getMonth() + 1) +
  pad(now.getDate()) +
  now.getFullYear() +
  "_" +
  pad(now.getHours()) +
  pad(now.getMinutes());

const buildDir = path.join(releasesDir, buildName);
const devDir = path.join(buildDir, "dev");

const exeName = "HyperlinksSpaceAppInstaller.exe";
const devArtifacts = [
  "win-unpacked",
  "builder-debug.yml",
  "builder-effective-config.yaml",
  "HyperlinksSpaceAppInstaller.exe.blockmap",
];

function moveIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  try {
    fs.renameSync(src, dest);
    console.log("Moved:", path.relative(releaseDir, src));
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
      console.log("Moved (copy+delete):", path.relative(releaseDir, src));
      return true;
    } catch (e2) {
      console.warn("Could not move", src, e2.message);
      return false;
    }
  }
}

const exeSrc = path.join(releaseDir, exeName);
if (!fs.existsSync(exeSrc)) {
  console.warn("No installer found in release/. Run electron-builder first.");
  process.exit(1);
}

// Create releases/build_MMDDYYYY_HHMM and dev folder
fs.mkdirSync(devDir, { recursive: true });

// Move installer to build folder root
const exeDest = path.join(buildDir, exeName);
moveIfExists(exeSrc, exeDest);

// Move optional/debug artifacts into dev/
for (const name of devArtifacts) {
  const src = path.join(releaseDir, name);
  const dest = path.join(devDir, name);
  moveIfExists(src, dest);
}

// Remove leftover empty release dir if possible (ignore errors)
try {
  const left = fs.readdirSync(releaseDir);
  if (left.length === 0) {
    fs.rmdirSync(releaseDir);
    console.log("Removed empty release/");
  }
} catch (_) {}

console.log("Output:", path.join(releasesDir, buildName));

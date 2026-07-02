#!/usr/bin/env node
/**
 * Resolve the next app semver for Windows releases by reading the latest version
 * from GitHub releases (tag vX.Y.Z or HyperlinksSpaceProgram_X.Y.Z.zip asset).
 * Does not require manual package.json bumps before CI builds.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const appDir = path.join(__dirname, "..");
const pkgPath = path.join(appDir, "package.json");
const lockPath = path.join(appDir, "package-lock.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const ZIP_VERSION_RE = /HyperlinksSpaceProgram_(\d+\.\d+\.\d+)\.zip$/i;

function parseVersion(raw) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/i.exec(String(raw || "").trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function formatVersion(parts) {
  return `${parts.major}.${parts.minor}.${parts.patch}`;
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

function maxVersion(a, b) {
  if (!a) return b;
  if (!b) return a;
  return compareVersions(a, b) >= 0 ? a : b;
}

function bumpPatch(version) {
  const parts = parseVersion(version);
  if (!parts) throw new Error(`[resolve-next-app-version] invalid version: ${version}`);
  parts.patch += 1;
  return formatVersion(parts);
}

function versionFromRelease(rel) {
  let best = null;
  const tagRaw = rel.tag_name || rel.tagName || "";
  const fromTag = parseVersion(String(tagRaw).replace(/_forge$/i, ""));
  if (fromTag) best = maxVersion(best, formatVersion(fromTag));

  for (const asset of rel.assets || []) {
    const name = asset.name || asset.label || "";
    const zipMatch = ZIP_VERSION_RE.exec(name);
    if (zipMatch) best = maxVersion(best, zipMatch[1]);
  }
  return best;
}

function getLatestReleaseVersion() {
  const repo = process.env.GITHUB_REPOSITORY?.trim();
  if (!repo) {
    console.warn("[resolve-next-app-version] GITHUB_REPOSITORY unset; using package.json version");
    return pkg.version;
  }

  try {
    const out = execSync(`gh api "repos/${repo}/releases?per_page=40"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const releases = JSON.parse(out);
    let best = null;
    for (const rel of releases) {
      best = maxVersion(best, versionFromRelease(rel));
    }
    return best || pkg.version;
  } catch (e) {
    console.warn("[resolve-next-app-version] gh api failed:", e?.message || e);
    return pkg.version;
  }
}

function writePackageVersion(version) {
  execSync(`npm pkg set version=${version}`, { cwd: appDir, stdio: "inherit" });
  if (!fs.existsSync(lockPath)) return;
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

const write = process.argv.includes("--write");
const latest = getLatestReleaseVersion();
const next = bumpPatch(latest);

if (write) {
  writePackageVersion(next);
  console.log(`[resolve-next-app-version] wrote ${next} (was latest release ${latest})`);
} else {
  console.log(`[resolve-next-app-version] next=${next} (latest release ${latest})`);
}

process.stdout.write(`${next}\n`);

const ghOutput = process.env.GITHUB_OUTPUT?.trim();
if (ghOutput) {
  fs.appendFileSync(ghOutput, `app_version=${next}\nrelease_tag=v${next}\n`);
}

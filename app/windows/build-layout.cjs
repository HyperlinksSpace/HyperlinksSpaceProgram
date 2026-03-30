/**
 * Windows electron-builder layout:
 * - Staging: releases/builder/build_MMDDYYYY_HHMM/eb-output/ (deleted after cleanup)
 * - Final:   releases/builder/build_MMDDYYYY_HHMM/HyperlinksSpaceAppInstaller_<stamp>.exe
 *            releases/builder/build_MMDDYYYY_HHMM/<RELEASE_BUILD_DEV_DIRNAME>/  (zip, yml, unpacked, etc.)
 * - BUILD_STAMP matches the folder id (required by package.json nsis.artifactName).
 */
const fs = require("fs");
const path = require("path");

/** Non-installer artifacts live here (same name for builder + Forge; CI expects this path). */
const RELEASE_BUILD_DEV_DIRNAME = "dev";

const pad = (n) => String(n).padStart(2, "0");

function makeDefaultBuildName(d = new Date()) {
  return (
    "build_" +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    d.getFullYear() +
    "_" +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

/** build_03292026_1938 -> 03292026_1938 */
function stampFromBuildName(buildName) {
  if (!/^build_\d{8}_\d{4}$/.test(buildName)) return null;
  return buildName.slice("build_".length);
}

/**
 * @param {string} appDir - path to app/ (directory with package.json)
 * @returns {{ buildName: string, buildStamp: string, buildDir: string, ebOutputDir: string }}
 */
function resolveBuildLayout(appDir) {
  const envBuildId = process.env.RELEASE_BUILD_ID?.trim();
  const buildName =
    envBuildId && /^build_\d{8}_\d{4}$/.test(envBuildId) ? envBuildId : makeDefaultBuildName();
  const buildStamp = process.env.BUILD_STAMP?.trim() || stampFromBuildName(buildName);
  if (!buildStamp) {
    throw new Error(`[build-layout] could not derive BUILD_STAMP for buildName=${buildName}`);
  }

  const releasesDir = path.join(appDir, "releases");
  const buildDir = path.join(releasesDir, "builder", buildName);
  const ebOutputDir = path.join(buildDir, "eb-output");

  return { buildName, buildStamp, releasesDir, buildDir, ebOutputDir };
}

function ensureCleanEbOutput(ebOutputDir) {
  try {
    if (fs.existsSync(ebOutputDir)) {
      fs.rmSync(ebOutputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(ebOutputDir, { recursive: true });
  } catch (e) {
    console.warn("[build-layout] ensureCleanEbOutput:", e?.message || e);
    throw e;
  }
}

module.exports = {
  RELEASE_BUILD_DEV_DIRNAME,
  resolveBuildLayout,
  ensureCleanEbOutput,
  makeDefaultBuildName,
  stampFromBuildName,
};

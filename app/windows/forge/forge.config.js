import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This file lives at app/windows/forge/ — app root is two levels up.
const appDir = path.resolve(__dirname, "..", "..");

const ICON_PATH = path.join(appDir, "assets", "icon.ico");
// `@electron/packager` expects `main` relative to `packagerConfig.dir`.
const MAIN_PROCESS_FILE_REL = path.join("windows", "build.cjs");

function forgeLog(step, details = "") {
  const ts = new Date().toISOString();
  const suffix = details ? ` ${details}` : "";
  console.log(`[forge:${ts}] ${step}${suffix}`);
}

// Forge config focused on Windows NSIS installer output.
// Note: your current electron-builder setup includes heavy custom NSIS hook files;
// Forge's stock NSIS maker may not replicate those exact installer pages out of the box.
export default {
  outDir: path.join(appDir, "releases", "forge", "artifacts"),
  buildIdentifier: "hsp-forge",
  hooks: {
    generateAssets: async () => {
      forgeLog("generateAssets");
    },
    prePackage: async (_forgeConfig, platform, arch) => {
      forgeLog("prePackage", `platform=${platform} arch=${arch}`);
    },
    packageAfterCopy: async (buildPath, electronVersion, platform, arch) => {
      forgeLog(
        "packageAfterCopy",
        `platform=${platform} arch=${arch} electron=${electronVersion} buildPath=${buildPath}`,
      );
    },
    packageAfterPrune: async (buildPath, electronVersion, platform, arch) => {
      forgeLog(
        "packageAfterPrune",
        `platform=${platform} arch=${arch} electron=${electronVersion} buildPath=${buildPath}`,
      );
    },
    packageAfterExtract: async (buildPath, electronVersion, platform, arch) => {
      forgeLog(
        "packageAfterExtract",
        `platform=${platform} arch=${arch} electron=${electronVersion} buildPath=${buildPath}`,
      );
    },
    postPackage: async (_forgeConfig, packageResult) => {
      const outputs = Array.isArray(packageResult?.outputPaths)
        ? packageResult.outputPaths.join(", ")
        : "";
      forgeLog(
        "postPackage",
        `platform=${packageResult?.platform} arch=${packageResult?.arch} outputs=${outputs}`,
      );
    },
    preMake: async () => {
      forgeLog("preMake");
    },
    postMake: async (_forgeConfig, makeResults) => {
      const parts = Array.isArray(makeResults)
        ? makeResults
            .map((r) => `${r.platform}/${r.arch}:${(r.artifacts || []).length}`)
            .join(", ")
        : "";
      forgeLog("postMake", `results=${parts}`);
    },
    // `@electron/packager` validates the Electron main entry using `package.json.main`
    // from the directory being packaged. Your app uses Expo Router, so we temporarily
    // switch main to the Electron main entry.
    //
    // This hook is only used inside Forge's packaging step.
    readPackageJson: async (_forgeConfig, packageJSON) => {
      packageJSON.main = MAIN_PROCESS_FILE_REL;
      return packageJSON;
    },
  },
  packagerConfig: {
    dir: appDir,
    name: "Hyperlinks Space Program",
    appBundleId: "com.sraibaby.app",
    icon: ICON_PATH,
    // electron-packager reads this as the main process entry.
    main: MAIN_PROCESS_FILE_REL,

    // Match your electron-builder asar strategy.
    asar: {
      smartUnpack: true,
    },
    asarUnpack: ["**/*.node", "**/*.dll", "**/*.exe"],
  },
  makers: [
    {
      name: "@felixrieseberg/electron-forge-maker-nsis",
      platforms: ["win32"],
      config: {
        // Launch app after install completes (same behavior as electron-builder).
        runAfterFinish: true,
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
      config: {},
    },
  ],
};

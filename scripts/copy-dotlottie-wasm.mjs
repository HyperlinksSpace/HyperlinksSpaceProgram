import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm");
const destDir = join(root, "public");
const dest = join(destDir, "dotlottie-player.wasm");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

import { spawn } from "node:child_process";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runMigrate() {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "db:migrate"], {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Keep logs explicit so startup failures are easy to debug in terminals/CI.
    console.log(`[db:migrate:retry] attempt ${attempt}/${MAX_ATTEMPTS}`);
    const code = await runMigrate();

    if (code === 0) {
      console.log("[db:migrate:retry] migrations succeeded");
      process.exit(0);
    }

    if (attempt < MAX_ATTEMPTS) {
      console.warn(
        `[db:migrate:retry] attempt ${attempt} failed (exit ${code}), retrying in ${RETRY_DELAY_MS}ms...`,
      );
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    console.error(
      `[db:migrate:retry] failed after ${MAX_ATTEMPTS} attempts, aborting startup`,
    );
    process.exit(code);
  }
}

void main();

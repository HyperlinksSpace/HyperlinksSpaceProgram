import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const EXPO_PORT = "8081";

function killProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve();
      return;
    }

    if (process.platform === "win32") {
      const killer = spawn("cmd", ["/c", "taskkill", "/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.on("close", () => resolve());
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore: process may already be gone.
    }
    resolve();
  });
}

function killProcessTreeSync(pid) {
  if (!pid) return;

  if (process.platform === "win32") {
    spawnSync("cmd", ["/c", "taskkill", "/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Ignore: process may already be gone.
  }
}

async function main() {
  const expoCliPath = path.resolve(process.cwd(), "node_modules", "expo", "bin", "cli");
  const vercelCliPath = path.resolve(process.cwd(), "node_modules", "vercel", "dist", "index.js");
  const expo = spawn(process.execPath, [expoCliPath, "start", "--port", EXPO_PORT], {
    stdio: "inherit",
    env: process.env,
  });
  const vercel = spawn(process.execPath, [vercelCliPath, "dev", "--yes"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SKIP_DB_MIGRATE: "1",
      TS_NODE_PROJECT: "api/tsconfig.json",
    },
  });
  const children = [expo, vercel];

  let shuttingDown = false;
  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await Promise.all(children.map((child) => killProcessTree(child.pid)));
    process.exit(exitCode);
  };

  process.on("exit", () => {
    for (const child of children) {
      killProcessTreeSync(child.pid);
    }
  });
  process.on("SIGINT", () => {
    void shutdown(130);
  });
  process.on("SIGTERM", () => {
    void shutdown(143);
  });

  expo.on("exit", (code) => {
    if (shuttingDown) return;
    void shutdown(code ?? 0);
  });
  vercel.on("exit", (code) => {
    if (shuttingDown) return;
    void shutdown(code ?? 0);
  });
}

void main();

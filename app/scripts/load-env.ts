import dotenv from "dotenv";
import path from "path";

/**
 * Unified env loader for local Node contexts.
 *
 * Loads .env and .env.local from repo root and app/.
 * On Vercel, these files normally aren't present, so this is effectively a no-op.
 */
export function loadEnv() {
  const cwd = process.cwd();
  dotenv.config({ path: path.join(cwd, ".env") });
  dotenv.config({ path: path.join(cwd, "app", ".env") });
  dotenv.config({ path: path.join(cwd, ".env.local") });
  dotenv.config({ path: path.join(cwd, "app", ".env.local") });
}


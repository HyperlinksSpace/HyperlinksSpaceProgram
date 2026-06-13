/**
 * Long-running TDLib gateway (QR auth + chat sync). Not deployable on Vercel serverless.
 * Run: npm run tdlib:gateway
 */
import { loadEnv } from "./load-env.js";
import { startTdlibGatewayServer } from "../telegram/tdlib/gatewayServer.js";
import { getTelegramApiCredentials } from "../telegram/tdlib/env.js";

loadEnv();

const creds = getTelegramApiCredentials();
if (!creds) {
  console.error(
    "[tdlib-gateway] Missing TELEGRAM_API_ID and TELEGRAM_API_HASH. Get them from https://my.telegram.org/apps",
  );
  process.exit(1);
}

startTdlibGatewayServer();

console.log("[tdlib-gateway] Ready. API handlers proxy here via TDLIB_GATEWAY_URL.");

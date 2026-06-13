/**
 * Phase 0/1 smoke: corpus chunks + optional TinyModel sidecar health.
 * Run: npm run verify:tinymodel
 */
import { HSP_PROGRAM_CORPUS_CHUNKS } from "../ai/hspProgramCorpus.js";
import {
  getTinyModelStatus,
  inferHspRouteHint,
  isTinyModelConfigured,
} from "../ai/tinymodel.js";

const MIN_CHUNKS = 8;

function fail(message: string): never {
  console.error(`[verify:tinymodel] FAIL: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const chunks = HSP_PROGRAM_CORPUS_CHUNKS.length;
  console.log(`[verify:tinymodel] corpus chunks: ${chunks}`);
  if (chunks < MIN_CHUNKS) {
    fail(`expected at least ${MIN_CHUNKS} corpus chunks, got ${chunks}`);
  }

  const route = inferHspRouteHint("open swap page");
  if (route !== "navigate:/swap") {
    fail(`route hint expected navigate:/swap, got ${route ?? "undefined"}`);
  }

  if (!isTinyModelConfigured()) {
    console.log(
      "[verify:tinymodel] TINYMODEL_API_URL not set — corpus-only OK (start sidecar for full check)",
    );
    console.log("[verify:tinymodel] OK");
    return;
  }

  const status = await getTinyModelStatus();
  console.log("[verify:tinymodel] sidecar:", JSON.stringify(status));
  if (!status.health_ok) {
    fail(
      `TinyModel health failed: ${String(status.error ?? "unknown")} (is phase3_reference_server running?)`,
    );
  }

  console.log("[verify:tinymodel] OK");
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  fail(message);
});

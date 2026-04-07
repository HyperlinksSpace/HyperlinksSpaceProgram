/**
 * Quick check that api/_base.ts works. Run: npx tsx scripts/test-api-base.ts
 * In Node (no window), getApiBaseUrl() uses Vercel env or falls back to http://localhost:3000.
 */
import { getApiBaseUrl, buildApiUrl } from "../api/_base.js";

const base = getApiBaseUrl();
const full = buildApiUrl("/api/telegram");

console.log("[api/base] getApiBaseUrl():", base);
console.log("[api/base] buildApiUrl('/api/telegram'):", full);
console.log("[api/base] OK");

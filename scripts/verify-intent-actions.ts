/**
 * Smoke test for HSP intent → action mapping (Phase 2).
 * Run: npm run verify:intent-actions
 */
import { actionsFromRouteHint } from "../ai/intentActions.js";
import { inferHspRouteHint } from "../ai/tinymodel.js";

function fail(message: string): never {
  console.error(`[verify:intent-actions] FAIL: ${message}`);
  process.exit(1);
}

function expectNavigate(input: string, path: string): void {
  const hint = inferHspRouteHint(input);
  const actions = actionsFromRouteHint(hint);
  if (actions.length !== 1 || actions[0]?.type !== "navigate" || actions[0].path !== path) {
    fail(`"${input}" expected navigate ${path}, got hint=${hint} actions=${JSON.stringify(actions)}`);
  }
}

expectNavigate("open swap page", "/swap");
expectNavigate("go to swap", "/swap");
expectNavigate("show my wallet address", "/get");

const telegramHint = inferHspRouteHint("connect telegram messages");
const telegramActions = actionsFromRouteHint(telegramHint);
if (
  telegramActions.length !== 1 ||
  telegramActions[0]?.type !== "feature" ||
  telegramActions[0].id !== "connect_telegram"
) {
  fail(`connect telegram expected feature action, got ${JSON.stringify(telegramActions)}`);
}

const featureActions = actionsFromRouteHint("feature:shield");
if (featureActions.length !== 1 || featureActions[0]?.type !== "feature") {
  fail("feature:shield mapping failed");
}

console.log("[verify:intent-actions] OK");

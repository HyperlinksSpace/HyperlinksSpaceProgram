/**
 * Dedicated `/api/wallet-swap` function.
 * Kept out of `api/[...path].ts` so Swap.Coffee / TON send imports cannot take down
 * messenger, feed, and other catch-all routes on FUNCTION_INVOCATION_FAILED.
 */
import handler from "./_handlers/wallet-swap.js";

export default handler;
export const POST = handler;
export const OPTIONS = handler;

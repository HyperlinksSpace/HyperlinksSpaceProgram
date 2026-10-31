/** Errors that may appear on status/resend while auth is still healthy at wait_code. */
export function isBenignWaitCodeConnectError(error: string | null | undefined): boolean {
  if (!error) return false;
  if (/authentication code can't be resend/i.test(error)) return true;
  if (error === "telegram_app_code_only") return true;
  return false;
}

export function resolveConnectSnapshotError(
  error: string | null | undefined,
  authState: string | null | undefined,
  ok?: boolean,
): string | null {
  const raw = error ?? (ok === false ? "connect_failed" : null);
  if (authState === "wait_code" && isBenignWaitCodeConnectError(raw)) return null;
  return raw;
}

type AttemptRow = {
  id: string;
  nonceHash: string;
  pkceVerifier: string;
  redirectUri: string;
  status: "created" | "consumed" | "expired" | "failed";
  expiresAtMs: number;
  errorCode?: string | null;
};

const ATTEMPTS = new Map<string, AttemptRow>();

function gcAttempts(): void {
  const now = Date.now();
  for (const [stateHash, row] of ATTEMPTS.entries()) {
    if (row.expiresAtMs <= now || row.status !== "created") {
      ATTEMPTS.delete(stateHash);
    }
  }
}

export function createEphemeralAttempt(input: {
  stateHash: string;
  nonceHash: string;
  pkceVerifier: string;
  redirectUri: string;
  ttlMs: number;
}): { id: string; expiresAtIso: string } {
  gcAttempts();
  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  const expiresAtMs = now + input.ttlMs;
  ATTEMPTS.set(input.stateHash, {
    id,
    nonceHash: input.nonceHash,
    pkceVerifier: input.pkceVerifier,
    redirectUri: input.redirectUri,
    status: "created",
    expiresAtMs,
  });
  return { id, expiresAtIso: new Date(expiresAtMs).toISOString() };
}

export function getEphemeralAttempt(stateHash: string): AttemptRow | null {
  gcAttempts();
  return ATTEMPTS.get(stateHash) ?? null;
}

export function setEphemeralAttemptStatus(
  stateHash: string,
  status: AttemptRow["status"],
  errorCode?: string | null,
): void {
  const row = ATTEMPTS.get(stateHash);
  if (!row) return;
  row.status = status;
  row.errorCode = errorCode ?? null;
  ATTEMPTS.set(stateHash, row);
}


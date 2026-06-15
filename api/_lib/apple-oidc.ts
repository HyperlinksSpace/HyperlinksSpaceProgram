import crypto from "crypto";
import { randomUrlSafe, sha256Base64Url, sha256Hex } from "./telegram-oidc.js";

export { randomUrlSafe, sha256Hex, sha256Base64Url };

const APPLE_ISSUER = "https://appleid.apple.com";
const AUTH_URL = "https://appleid.apple.com/auth/authorize";
const TOKEN_URL = "https://appleid.apple.com/auth/token";
const JWKS_URL = "https://appleid.apple.com/auth/keys";

type Jwk = {
  kid?: string;
  kty?: string;
  alg?: string;
  n?: string;
  e?: string;
};

type JwksResponse = { keys?: Jwk[] };

export type AppleIdTokenClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
};

export type AppleFirstLoginUser = {
  name?: { firstName?: string; lastName?: string };
  email?: string;
};

let jwksCache: { keys: Jwk[]; fetchedAtMs: number } | null = null;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s + pad, "base64");
}

export function normalizeApplePrivateKeyPem(raw: string): string {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (trimmed.includes("\\n")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  return trimmed;
}

export function buildAppleAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function createAppleClientSecret(input: {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKeyPem: string;
}): string {
  const header = { alg: "ES256", kid: input.keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: input.teamId,
    iat: now,
    exp: now + 86400 * 180,
    aud: APPLE_ISSUER,
    sub: input.clientId,
  };
  const signingInput = `${base64UrlEncode(Buffer.from(JSON.stringify(header)))}.${base64UrlEncode(Buffer.from(JSON.stringify(payload)))}`;
  const keyObject = crypto.createPrivateKey(input.privateKeyPem);
  const signature = crypto.sign("SHA256", Buffer.from(signingInput, "utf8"), {
    key: keyObject,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function fetchJwks(): Promise<Jwk[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAtMs < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(JWKS_URL, { method: "GET" });
  if (!res.ok) {
    throw new Error(`jwks_fetch_failed_${res.status}`);
  }
  const data = (await res.json()) as JwksResponse;
  const keys = Array.isArray(data.keys) ? data.keys : [];
  if (keys.length === 0) {
    throw new Error("jwks_empty");
  }
  jwksCache = { keys, fetchedAtMs: now };
  return keys;
}

function parseJwt(token: string): {
  header: Record<string, unknown>;
  payload: AppleIdTokenClaims;
  signingInput: Buffer;
  signature: Buffer;
} {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("jwt_format_invalid");
  }
  const [h, p, s] = parts;
  const header = JSON.parse(base64UrlDecode(h).toString("utf8")) as Record<string, unknown>;
  const payload = JSON.parse(base64UrlDecode(p).toString("utf8")) as AppleIdTokenClaims;
  return {
    header,
    payload,
    signingInput: Buffer.from(`${h}.${p}`, "utf8"),
    signature: base64UrlDecode(s),
  };
}

function verifyJwtSignature(input: {
  alg: string;
  signingInput: Buffer;
  signature: Buffer;
  jwk: Jwk;
}): boolean {
  if (input.alg !== "RS256") {
    throw new Error(`unsupported_alg_${input.alg}`);
  }
  const keyObject = crypto.createPublicKey({ key: input.jwk as any, format: "jwk" });
  return crypto.verify("RSA-SHA256", input.signingInput, keyObject, input.signature);
}

function assertTokenClaims(input: {
  claims: AppleIdTokenClaims;
  clientId: string;
  expectedNonce?: string;
}): void {
  const { claims, clientId, expectedNonce } = input;
  if (String(claims.iss) !== APPLE_ISSUER) throw new Error("invalid_iss");
  const audRaw = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const aud = audRaw.map((v) => String(v));
  if (!aud.includes(String(clientId))) throw new Error("invalid_aud");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp < now - 120) throw new Error("token_expired");
  if (!Number.isFinite(claims.iat) || claims.iat > now + 120) throw new Error("invalid_iat");
  if (expectedNonce != null && expectedNonce.length > 0) {
    if (!claims.nonce || claims.nonce !== expectedNonce) throw new Error("invalid_nonce");
  }
  if (!claims.sub || typeof claims.sub !== "string") throw new Error("missing_sub");
}

export async function exchangeAppleCodeForTokens(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  codeVerifier: string;
}): Promise<{ id_token: string; access_token?: string; refresh_token?: string }> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  body.set("redirect_uri", input.redirectUri);
  body.set("client_id", input.clientId);
  body.set("client_secret", input.clientSecret);
  body.set("code_verifier", input.codeVerifier);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : "";
    const errDesc = typeof json.error_description === "string" ? json.error_description : "";
    const detail = [err, errDesc].filter(Boolean).join(": ");
    throw new Error(detail || `token_exchange_failed_${res.status}`);
  }
  const idToken = typeof json.id_token === "string" ? json.id_token : "";
  if (!idToken) throw new Error("missing_id_token");
  return {
    id_token: idToken,
    access_token: typeof json.access_token === "string" ? json.access_token : undefined,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
  };
}

export async function validateAppleIdToken(input: {
  idToken: string;
  clientId: string;
  expectedNonce?: string;
}): Promise<AppleIdTokenClaims> {
  const parsed = parseJwt(input.idToken);
  const alg = typeof parsed.header.alg === "string" ? parsed.header.alg : "";
  const kid = typeof parsed.header.kid === "string" ? parsed.header.kid : "";
  if (!alg || !kid) throw new Error("jwt_header_invalid");

  const keys = await fetchJwks();
  let key = keys.find((k) => k.kid === kid);
  if (!key) {
    jwksCache = null;
    const fresh = await fetchJwks();
    key = fresh.find((k) => k.kid === kid);
    if (!key) throw new Error("unknown_kid");
  }
  if (
    !verifyJwtSignature({ alg, signingInput: parsed.signingInput, signature: parsed.signature, jwk: key })
  ) {
    throw new Error("invalid_signature");
  }

  assertTokenClaims({ claims: parsed.payload, clientId: input.clientId, expectedNonce: input.expectedNonce });
  return parsed.payload;
}

export function parseAppleFirstLoginUser(raw: unknown): {
  displayName: string | null;
  email: string | null;
} {
  if (typeof raw !== "string" || !raw.trim()) {
    return { displayName: null, email: null };
  }
  try {
    const parsed = JSON.parse(raw) as AppleFirstLoginUser;
    const parts = [parsed.name?.firstName, parsed.name?.lastName].filter(
      (part): part is string => typeof part === "string" && part.trim().length > 0,
    );
    return {
      displayName: parts.length > 0 ? parts.join(" ") : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
    };
  } catch {
    return { displayName: null, email: null };
  }
}

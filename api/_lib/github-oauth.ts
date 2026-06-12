import { randomUrlSafe, sha256Base64Url, sha256Hex } from "./telegram-oidc.js";

export { randomUrlSafe, sha256Hex, sha256Base64Url };

const AUTH_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const USER_EMAILS_URL = "https://api.github.com/user/emails";

const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "HyperlinksSpaceProgram",
} as const;

export type GithubUserProfile = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export function buildGithubAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  /** GitHub docs: show account picker when multiple accounts are signed in. */
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

function formatGithubTokenExchangeError(json: Record<string, unknown>, status: number): string {
  const err = typeof json.error === "string" ? json.error : "";
  const errDesc = typeof json.error_description === "string" ? json.error_description : "";
  const detail = [err, errDesc].filter(Boolean).join(": ");
  return detail || `token_exchange_failed_${status}`;
}

export async function exchangeGithubCodeForTokens(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  codeVerifier: string;
}): Promise<{ access_token: string }> {
  const body = new URLSearchParams();
  body.set("client_id", input.clientId);
  body.set("client_secret", input.clientSecret);
  body.set("code", input.code);
  body.set("redirect_uri", input.redirectUri);
  body.set("code_verifier", input.codeVerifier);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const tokenError = typeof json.error === "string" ? json.error : "";
  if (!res.ok || tokenError) {
    throw new Error(formatGithubTokenExchangeError(json, res.status));
  }
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  if (!accessToken) {
    throw new Error(formatGithubTokenExchangeError(json, res.status));
  }
  return { access_token: accessToken };
}

async function fetchGithubPrimaryEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USER_EMAILS_URL, {
    method: "GET",
    headers: {
      ...GITHUB_API_HEADERS,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as Array<{
    email?: string;
    primary?: boolean;
    verified?: boolean;
  }>;
  if (!Array.isArray(rows)) return null;
  const primary = rows.find((row) => row.primary && row.verified && typeof row.email === "string");
  if (primary?.email) return primary.email;
  const verified = rows.find((row) => row.verified && typeof row.email === "string");
  return verified?.email ?? null;
}

export async function fetchGithubUserProfile(accessToken: string): Promise<GithubUserProfile> {
  const res = await fetch(USER_URL, {
    method: "GET",
    headers: {
      ...GITHUB_API_HEADERS,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.message === "string" ? json.message : "";
    throw new Error(message || `github_user_fetch_failed_${res.status}`);
  }
  const id = typeof json.id === "number" ? json.id : Number(json.id);
  const login = typeof json.login === "string" ? json.login : "";
  if (!Number.isFinite(id) || id <= 0 || !login) {
    throw new Error("github_user_invalid");
  }
  let email = typeof json.email === "string" ? json.email : null;
  if (!email) {
    email = await fetchGithubPrimaryEmail(accessToken);
  }
  return {
    id,
    login,
    name: typeof json.name === "string" ? json.name : null,
    email,
    avatar_url: typeof json.avatar_url === "string" ? json.avatar_url : null,
  };
}

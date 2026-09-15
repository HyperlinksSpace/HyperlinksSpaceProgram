import { buildApiUrl } from "../../api/_base";

export async function requestWalletMnemonic(opts?: {
  initDataRaw?: string | null;
}): Promise<
  | { ok: true; mnemonic: string[]; walletAddress: string }
  | { ok: false; error: string }
> {
  const trimmedInit =
    typeof opts?.initDataRaw === "string" ? opts.initDataRaw.trim() : "";
  const body: Record<string, unknown> = {};
  if (trimmedInit) body.initData = trimmedInit;

  try {
    const res = await fetch(buildApiUrl("/api/wallet-mnemonic"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      mnemonic?: unknown;
      wallet_address?: string;
      error?: string;
    } | null;
    const words = Array.isArray(data?.mnemonic)
      ? data!.mnemonic.filter((w): w is string => typeof w === "string" && w.trim().length > 0)
      : [];
    if (res.ok && data?.ok && words.length >= 12) {
      return {
        ok: true,
        mnemonic: words.map((w) => w.trim()),
        walletAddress:
          typeof data.wallet_address === "string" ? data.wallet_address.trim() : "",
      };
    }
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : `http_${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}

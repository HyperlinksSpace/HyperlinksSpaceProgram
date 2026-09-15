import { buildApiUrl } from "../../api/_base";

export async function requestUpdateDisplayName(opts: {
  displayName: string;
  initDataRaw?: string | null;
}): Promise<{ ok: true; displayName: string } | { ok: false; error: string }> {
  const trimmedInit = typeof opts.initDataRaw === "string" ? opts.initDataRaw.trim() : "";
  const body: Record<string, unknown> = {
    displayName: opts.displayName.trim(),
  };
  if (trimmedInit) body.initData = trimmedInit;

  try {
    const res = await fetch(buildApiUrl("/api/profile-display-name"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      display_name?: string;
      error?: string;
    } | null;
    if (res.ok && data?.ok && typeof data.display_name === "string" && data.display_name.trim()) {
      return { ok: true, displayName: data.display_name.trim() };
    }
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : `http_${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "update_failed",
    };
  }
}

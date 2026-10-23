/**
 * After OAuth / email sign-in from `/owner-deploy`, land on authenticated home
 * with Smart → Owner selected (flag survives OAuth redirects to `/`).
 */
const STORAGE_KEY = "hsp.ownerDeploy.afterAuth.v1";

export function markOwnerDeployAfterAuth(): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, "1");
    }
  } catch {
    /* private mode */
  }
}

export function takeOwnerDeployAfterAuth(): boolean {
  try {
    if (typeof sessionStorage === "undefined") return false;
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v) sessionStorage.removeItem(STORAGE_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

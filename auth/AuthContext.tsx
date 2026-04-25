import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../api/_base";
import { logPageDisplay } from "../ui/pageDisplayLog";

export type AuthContextValue = {
  isAuthenticated: boolean;
  authReady: boolean;
  authHydrated: boolean;
  signIn: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_HINT_STORAGE_KEY = "hs_auth_hint_v1";

type AuthHint = "in" | "out";

function writeAuthHint(value: AuthHint): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_HINT_STORAGE_KEY, value);
  } catch {
    // ignore storage failures (private mode, strict browser settings)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // SSR / first paint: keep default state. Do not read the stored auth hint before session:
  // a stale "in" hint flashed `HomeAuthenticatedScreen` before `GET /api/auth/session` returned
  // (welcome blink) and could participate in client/server tree mismatch (React #418). Session
  // is the only source of truth for initial `isAuthenticated`; we still `writeAuthHint` after
  // bootstrap and on signIn/signOut for a soft cache only.
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authHydrated, setAuthHydrated] = useState(false);

  useLayoutEffect(() => {
    setAuthHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const startedAt = Date.now();
      const sessionUrl = buildApiUrl("/api/auth/session");
      logPageDisplay("auth_bootstrap_start", {
        sessionUrl,
      });
      try {
        const response = await fetch(sessionUrl, {
          method: "GET",
          credentials: "include",
        });
        const json = (await response.json().catch(() => ({}))) as { authenticated?: boolean };
        const authenticated = response.ok && json?.authenticated === true;
        writeAuthHint(authenticated ? "in" : "out");
        logPageDisplay("auth_bootstrap_response", {
          ok: response.ok,
          status: response.status,
          authenticated,
          elapsedMs: Date.now() - startedAt,
        });
        if (!cancelled) {
          setAuthenticated(authenticated);
        }
      } catch (error) {
        logPageDisplay("auth_bootstrap_error", {
          elapsedMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        // Ignore bootstrap errors; app can still sign in via interactive flow.
      } finally {
        if (!cancelled) {
          setAuthReady(true);
          logPageDisplay("auth_bootstrap_ready", {
            elapsedMs: Date.now() - startedAt,
          });
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(() => {
    writeAuthHint("in");
    setAuthenticated(true);
    setAuthReady(true);
  }, []);

  const signOut = useCallback(() => {
    writeAuthHint("out");
    setAuthenticated(false);
    setAuthReady(true);
    void fetch(buildApiUrl("/api/auth/session"), {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {
      // best effort
    });
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, authReady, authHydrated, signIn, signOut }),
    [isAuthenticated, authReady, authHydrated, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx == null) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../api/_base";
import { logPageDisplay } from "../ui/pageDisplayLog";

export type AuthContextValue = {
  isAuthenticated: boolean;
  authReady: boolean;
  signIn: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);

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
        logPageDisplay("auth_bootstrap_response", {
          ok: response.ok,
          status: response.status,
          authenticated: json?.authenticated === true,
          elapsedMs: Date.now() - startedAt,
        });
        if (!cancelled && response.ok && json?.authenticated === true) {
          setAuthenticated(true);
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
    setAuthenticated(true);
    setAuthReady(true);
  }, []);

  const signOut = useCallback(() => {
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
    () => ({ isAuthenticated, authReady, signIn, signOut }),
    [isAuthenticated, authReady, signIn, signOut],
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

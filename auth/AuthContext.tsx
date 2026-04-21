import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../api/_base";

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
      try {
        const response = await fetch(buildApiUrl("/api/auth/session"), {
          method: "GET",
          credentials: "include",
        });
        const json = (await response.json().catch(() => ({}))) as { authenticated?: boolean };
        if (!cancelled && response.ok && json?.authenticated === true) {
          setAuthenticated(true);
        }
      } catch {
        // Ignore bootstrap errors; app can still sign in via interactive flow.
      } finally {
        if (!cancelled) setAuthReady(true);
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

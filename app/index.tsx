import { useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { WelcomeContent } from "../ui/components/WelcomeContent";
import { getBuildDisplaySnapshot, logPageDisplay } from "../ui/pageDisplayLog";
import { HomeAuthenticatedScreen } from "../ui/screens/HomeAuthenticatedScreen";

/**
 * Root URL `http://localhost:3000/` (path `/`): welcome when signed out, main app when signed in.
 * Same URL for both — only session state chooses the screen; legacy `/home` redirects here.
 *
 * Welcome is shown immediately on first paint; session bootstrap runs in parallel (`AuthProvider`).
 * If the session is valid, we switch to the authenticated home once `authReady` (brief welcome → home
 * only for returning signed-in users).
 */
export default function Index() {
  const { isAuthenticated, authReady } = useAuth();
  const lastLoggedVariantRef = useRef<string | null>(null);

  useEffect(() => {
    const variant = isAuthenticated ? "home_authenticated" : "welcome";
    if (lastLoggedVariantRef.current === variant) return;
    lastLoggedVariantRef.current = variant;
    logPageDisplay("index_route", {
      variant,
      sessionPending: !authReady,
      authReady,
      isAuthenticated,
      build: getBuildDisplaySnapshot(),
    });
  }, [authReady, isAuthenticated]);

  if (isAuthenticated) {
    return <HomeAuthenticatedScreen />;
  }
  return <WelcomeContent />;
}

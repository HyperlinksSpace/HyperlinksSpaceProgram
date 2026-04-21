import { Redirect } from "expo-router";
import { useAuth } from "../auth/AuthContext";

/**
 * Entry: send users to Welcome or Home. Replace stub auth in `auth/AuthContext.tsx` with real sessions.
 * Wait for bootstrap so we don't redirect before session state is known (avoids route flicker).
 */
export default function Index() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return null;
  }

  if (isAuthenticated) {
    return <Redirect href="/home" />;
  }

  return <Redirect href="/welcome" />;
}

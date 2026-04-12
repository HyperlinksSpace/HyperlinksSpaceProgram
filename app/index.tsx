import { Redirect } from "expo-router";
import { useAuth } from "../auth/AuthContext";

/**
 * Entry: send users to Welcome or Home. Replace stub auth in `auth/AuthContext.tsx` with real sessions.
 */
export default function Index() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Redirect href="/home" />;
  }

  return <Redirect href="/welcome" />;
}

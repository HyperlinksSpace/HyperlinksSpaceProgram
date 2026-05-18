import { Redirect } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { SwapScreen } from "../../ui/screens/SwapScreen";

export default function SwapRoute() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }

  return <SwapScreen />;
}

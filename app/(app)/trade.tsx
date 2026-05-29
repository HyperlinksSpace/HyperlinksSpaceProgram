import { Redirect } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { TradeScreen } from "../../ui/screens/TradeScreen";

export default function TradeRoute() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }

  return <TradeScreen />;
}

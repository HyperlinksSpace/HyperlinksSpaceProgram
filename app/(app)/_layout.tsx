import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../auth/AuthContext";

export default function AppGroupLayout() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

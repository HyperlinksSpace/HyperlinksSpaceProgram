import { Stack } from "expo-router";

export default function AppGroupLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { flex: 1, minHeight: 0 } }} />;
}

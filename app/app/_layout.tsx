import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { TelegramSDKProvider } from "./components/TelegramSDKProvider";
import { GlobalLogoBarWithFallback } from "./components/GlobalLogoBarWithFallback";

export default function RootLayout() {
  return (
    <TelegramSDKProvider>
      <View style={styles.root}>
        <GlobalLogoBarWithFallback />
        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </View>
    </TelegramSDKProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});

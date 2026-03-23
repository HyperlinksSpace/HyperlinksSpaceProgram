import "../global.css";
import { View, StyleSheet, Platform, KeyboardAvoidingView } from "react-native";
import { Stack } from "expo-router";
import { TelegramProvider } from "./_components/Telegram";
import { GlobalLogoBarWithFallback } from "./_components/GlobalLogoBarWithFallback";
import { GlobalBottomBar } from "./_components/GlobalBottomBar";
import { GlobalBottomBarWeb } from "./_components/GlobalBottomBarWeb";

/**
 * Three-block column layout (same as Flutter):
 * 1. Logo bar (optional in TMA when not fullscreen)
 * 2. Main area (flex, scrollable per screen) – Stack updates on route change
 * 3. [Web only] Raw HTML textarea test (compare with GlobalBottomBar in TMA)
 * 4. AI & Search bar (fixed at bottom)
 */
export default function RootLayout() {
  const content = (
    <View style={styles.root}>
      <GlobalLogoBarWithFallback />
      <View style={styles.main}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      {Platform.OS === "web" ? (
        <GlobalBottomBarWeb />
      ) : (
        <GlobalBottomBar />
      )}
    </View>
  );

  return (
    <TelegramProvider>
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </TelegramProvider>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  root: {
    flex: 1,
    flexDirection: "column",
    overflow: "hidden",
  },
  main: {
    flex: 1,
    minHeight: 0,
  },
});

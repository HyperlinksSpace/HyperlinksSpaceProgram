import "../global.css";
import { View, StyleSheet, Platform, KeyboardAvoidingView, AppState, Alert } from "react-native";
import { Stack } from "expo-router";
import * as Updates from "expo-updates";
import { TelegramProvider, useTelegram } from "../ui/components/Telegram";
import { GlobalLogoBarWithFallback } from "../ui/components/GlobalLogoBarWithFallback";
import { GlobalBottomBar } from "../ui/components/GlobalBottomBar";
import { GlobalBottomBarWeb } from "../ui/components/GlobalBottomBarWeb";
import { useColors } from "../ui/theme";
import { useEffect, useRef } from "react";

/**
 * Three-block column layout (same as Flutter):
 * 1. Logo bar (optional in TMA when not fullscreen)
 * 2. Main area (flex, scrollable per screen) – Stack updates on route change
 * 3. [Web only] Raw HTML textarea test (compare with GlobalBottomBar in TMA)
 * 4. AI & Search bar (fixed at bottom)
 */
export default function RootLayout() {
  useOtaUpdateChecks();
  return (
    <TelegramProvider>
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <RootContent />
        </KeyboardAvoidingView>
      ) : (
        <RootContent />
      )}
    </TelegramProvider>
  );
}

function useOtaUpdateChecks() {
  const lastCheckAtRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const checkForOtaUpdate = async () => {
      const now = Date.now();
      // Throttle checks to avoid noisy network calls while app toggles foreground quickly.
      if (now - lastCheckAtRef.current < 10 * 60 * 1000) return;
      lastCheckAtRef.current = now;

      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;

        await Updates.fetchUpdateAsync();
        Alert.alert(
          "Update ready",
          "A new version has been downloaded. Restart now to apply it?",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Restart",
              onPress: () => {
                void Updates.reloadAsync();
              },
            },
          ],
        );
      } catch (error) {
        console.warn("[updates] OTA check failed", error);
      }
    };

    void checkForOtaUpdate();
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void checkForOtaUpdate();
      }
    });
    return () => sub.remove();
  }, []);
}

function RootContent() {
  const colors = useColors();
  const { themeBgReady, useTelegramTheme } = useTelegram();
  const backgroundColor = themeBgReady ? colors.background : "transparent";
  // Stronger than opacity:0 — avoids one frame of dark RN-web compositing before themeBgReady.
  const hideWebUntilTheme =
    Platform.OS === "web" && useTelegramTheme && !themeBgReady;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor,
          opacity: themeBgReady ? 1 : 0,
          pointerEvents: themeBgReady ? "auto" : "none",
          ...(Platform.OS === "web"
            ? { display: hideWebUntilTheme ? "none" : "flex" }
            : {}),
        },
      ]}
    >
      <GlobalLogoBarWithFallback />
      <View style={styles.main}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      {Platform.OS === "web" ? (
        // Avoid mounting textarea/DOM mirror before theme — kills dark flash from RN-web inputs.
        !useTelegramTheme || themeBgReady ? (
          <GlobalBottomBarWeb />
        ) : null
      ) : (
        <GlobalBottomBar />
      )}
    </View>
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

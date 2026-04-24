/**
 * Fallback logo bar when TMA SDK is not available (e.g. browser).
 * Same layout: 30px top padding, 24×24 logo on narrow viewports (≤480px), 32×32 otherwise, 10px bottom, 15px horizontal.
 */
import { View, Pressable, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useMemo } from "react";
import { useRouter } from "expo-router";
import { HyperlinksSpaceLogo } from "./HyperlinksSpaceLogo";

const LOGO_HEIGHT_DESKTOP = 32;
const LOGO_HEIGHT_MOBILE = 24;
const HEADER_NARROW_MAX_WIDTH = 480;
const BOTTOM_PADDING = 10;
const HORIZONTAL_PADDING = 15;
const BROWSER_FALLBACK_TOP_PADDING = 30;

export function GlobalLogoBarFallback() {
  const router = useRouter();
  const { width: dimensionsWidth } = useWindowDimensions();
  const windowWidth = useMemo(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return Math.max(dimensionsWidth, window.innerWidth || 0);
    }
    return dimensionsWidth;
  }, [dimensionsWidth]);
  const logoHeight = windowWidth <= HEADER_NARROW_MAX_WIDTH ? LOGO_HEIGHT_MOBILE : LOGO_HEIGHT_DESKTOP;
  const blockHeight = BROWSER_FALLBACK_TOP_PADDING + logoHeight + BOTTOM_PADDING;

  return (
    <View style={[styles.container, { height: blockHeight }]}>
      <View
        style={[
          styles.inner,
          {
            paddingTop: BROWSER_FALLBACK_TOP_PADDING,
            paddingBottom: BOTTOM_PADDING,
            paddingHorizontal: HORIZONTAL_PADDING,
          },
        ]}
      >
        <Pressable
          onPress={() => router.replace("/")}
          style={styles.logoWrap}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
        >
          <View style={[styles.logoBox, { width: logoHeight, height: logoHeight }]}>
            <HyperlinksSpaceLogo width={logoHeight} height={logoHeight} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "transparent",
  },
  inner: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    maxWidth: 600,
    alignItems: "center",
    justifyContent: "center",
  },
  logoBox: {
    alignItems: "center",
    justifyContent: "center",
  },
});

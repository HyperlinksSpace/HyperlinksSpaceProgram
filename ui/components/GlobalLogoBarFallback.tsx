/**
 * Fallback logo bar when TMA SDK is not available (e.g. browser).
 * Same layout: 30px top padding, 32px logo, 10px bottom, 15px horizontal.
 */
import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { HyperlinksSpaceLogo } from "./HyperlinksSpaceLogo";

const LOGO_HEIGHT = 32;
const BOTTOM_PADDING = 10;
const HORIZONTAL_PADDING = 15;
const BROWSER_FALLBACK_TOP_PADDING = 30;
const BLOCK_HEIGHT =
  BROWSER_FALLBACK_TOP_PADDING + LOGO_HEIGHT + BOTTOM_PADDING;

export function GlobalLogoBarFallback() {
  const router = useRouter();

  return (
    <View style={[styles.container, { height: BLOCK_HEIGHT }]}>
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
          <View style={styles.logoBox}>
            <HyperlinksSpaceLogo width={LOGO_HEIGHT} height={LOGO_HEIGHT} />
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
    width: LOGO_HEIGHT,
    height: LOGO_HEIGHT,
  },
});

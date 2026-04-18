/**
 * Welcome-only header: black bar, wordmark (logo.svg art), About on the right.
 * Not used on other routes — see GlobalLogoBar.
 */
import React from "react";
import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { useTelegram } from "./Telegram";
import { LogoWordmark } from "./LogoWordmark";

const BG = "#000000";
const LOGO_HEIGHT = 40;
const LOGO_WIDTH = (104 / 40) * LOGO_HEIGHT;
const VERTICAL_INDENT = 15;
const ABOUT_URL = "https://www.hyperlinks.space";

export function WelcomeMarketingHeader() {
  const { triggerHaptic } = useTelegram();

  const onAbout = () => {
    triggerHaptic("light");
    void Linking.openURL(ABOUT_URL);
  };

  return (
    <View style={[styles.bar, { paddingTop: VERTICAL_INDENT, paddingBottom: VERTICAL_INDENT }]}>
      <View style={styles.row}>
        <View style={styles.left} accessible accessibilityLabel="Hyperlinks Space">
          <LogoWordmark width={LOGO_WIDTH} height={LOGO_HEIGHT} />
        </View>
        <Pressable
          onPress={onAbout}
          style={styles.aboutHit}
          accessibilityRole="link"
          accessibilityLabel="About"
          accessibilityHint="Opens hyperlinks.space in the browser"
        >
          <Text style={styles.aboutText}>About</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: BG,
    paddingHorizontal: 16,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#818181",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  left: {
    flexShrink: 1,
    marginRight: 12,
  },
  aboutHit: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  aboutText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "400",
  },
});

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAppStrings } from "../../locales/AppStringsContext";
import { useColors } from "../theme";
import { AppModalSheet } from "../components/AppModalSheet";
import { WelcomeAppPreviews } from "../components/WelcomeAppPreviews";
import { WelcomeAuthButtons } from "../components/WelcomeAuthButtons";
import { WelcomeLanguageSwitcher } from "../components/WelcomeLanguageSwitcher";
import { markOwnerDeployAfterAuth } from "./ownerDeployAfterAuth";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const WIDE_LAYOUT_MIN_WIDTH = 480;
const MAX_TEXT_WIDTH = 360;
const GAP_TITLE_TO_LANGUAGE = 14;
const GAP_LANGUAGE_TO_SUBTITLE = 10;
const GAP_SUBTITLE_TO_AUTH = 22;
const HEADING_FONT_WIDE = 35;
const HEADING_LINE_WIDE = 42;
const HEADING_FONT_NARROW = 25;
const HEADING_LINE_NARROW = 30;

/**
 * Full welcome marketing + auth controls in a floating dialog
 * (title, language, subtitle, providers, app screenshots).
 */
export function OwnerDeploySignInDialog({ visible, onClose }: Props) {
  const { t } = useAppStrings();
  const colors = useColors();
  const [bodyWidth, setBodyWidth] = useState(0);
  const isWideLayout = bodyWidth > WIDE_LAYOUT_MIN_WIDTH;
  const onBodyLayout = useCallback((width: number) => {
    const next = Math.round(width);
    setBodyWidth((current) => (current === next ? current : next));
  }, []);

  useEffect(() => {
    if (!visible) return;
    markOwnerDeployAfterAuth();
  }, [visible]);

  if (!visible) return null;

  return (
    <AppModalSheet
      visible
      onClose={onClose}
      title={t("ownerDeploy.signInTitle")}
      minSize={{ width: 360, height: 520 }}
      sizeStorageKey="hsp.ownerDeploySignIn.size.v2"
      offsetStorageKey="hsp.ownerDeploySignIn.offset.v1"
    >
      <View
        style={styles.content}
        onLayout={(event) => onBodyLayout(event.nativeEvent.layout.width)}
      >
        <View style={styles.introBlock}>
          <Text
            style={[
              styles.headingText,
              isWideLayout ? styles.headingTextWide : styles.headingTextNarrow,
              { color: colors.primary },
            ]}
          >
            {t("welcome.title")}
          </Text>
          <View style={styles.languageBlock}>
            <WelcomeLanguageSwitcher />
          </View>
          <Text style={[styles.subtitleText, { color: colors.secondary }]}>
            {t("welcome.subtitle")}
          </Text>
        </View>
        <View style={styles.authBlock}>
          <WelcomeAuthButtons hideAppPreviews />
        </View>
        {bodyWidth > 0 ? (
          <View style={styles.previewBlock}>
            <WelcomeAppPreviews layoutWidth={bodyWidth} />
          </View>
        ) : null}
      </View>
    </AppModalSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    alignItems: "center",
  },
  introBlock: {
    width: "100%",
    maxWidth: MAX_TEXT_WIDTH,
    alignItems: "center",
  },
  headingText: {
    fontWeight: "400",
    textAlign: "center",
    includeFontPadding: false,
    width: "100%",
  },
  headingTextWide: {
    fontSize: HEADING_FONT_WIDE,
    lineHeight: HEADING_LINE_WIDE,
  },
  headingTextNarrow: {
    fontSize: HEADING_FONT_NARROW,
    lineHeight: HEADING_LINE_NARROW,
  },
  languageBlock: {
    width: "100%",
    marginTop: GAP_TITLE_TO_LANGUAGE,
    alignItems: "center",
  },
  subtitleText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    textAlign: "center",
    marginTop: GAP_LANGUAGE_TO_SUBTITLE,
    includeFontPadding: false,
  },
  authBlock: {
    width: "100%",
    maxWidth: MAX_TEXT_WIDTH,
    marginTop: GAP_SUBTITLE_TO_AUTH,
    alignItems: "center",
  },
  previewBlock: {
    width: "100%",
    alignItems: "center",
  },
});

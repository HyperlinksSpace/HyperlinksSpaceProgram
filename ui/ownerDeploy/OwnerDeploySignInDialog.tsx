import { useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { useAppStrings } from "../../locales/AppStringsContext";
import { useColors } from "../theme";
import { AppModalSheet } from "../components/AppModalSheet";
import { WelcomeAuthButtons } from "../components/WelcomeAuthButtons";
import { WelcomeLanguageSwitcher } from "../components/WelcomeLanguageSwitcher";
import { markOwnerDeployAfterAuth } from "./ownerDeployAfterAuth";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const WIDE_LAYOUT_MIN_WIDTH = 480;
const GAP_TITLE_TO_LANGUAGE = 14;
const GAP_LANGUAGE_TO_SUBTITLE = 10;
const GAP_SUBTITLE_TO_AUTH = 22;

/**
 * Full welcome marketing + auth controls in a floating dialog
 * (title, language, subtitle, providers, app screenshots).
 */
export function OwnerDeploySignInDialog({ visible, onClose }: Props) {
  const { t } = useAppStrings();
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const isWideLayout = windowWidth > WIDE_LAYOUT_MIN_WIDTH;

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
      <View style={styles.content}>
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
          <WelcomeAuthButtons />
        </View>
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
    maxWidth: 360,
    alignItems: "center",
  },
  headingText: {
    fontWeight: "400",
    textAlign: "center",
    includeFontPadding: false,
    width: "100%",
  },
  headingTextWide: {
    fontSize: 28,
    lineHeight: 34,
  },
  headingTextNarrow: {
    fontSize: 22,
    lineHeight: 28,
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
    maxWidth: 360,
    marginTop: GAP_SUBTITLE_TO_AUTH,
    alignItems: "center",
  },
});

import { View, Text, useWindowDimensions, StyleSheet } from "react-native";
import { useColors } from "../../ui/theme";
import { WelcomeAuthButtons } from "../../ui/components/WelcomeAuthButtons";

const CONTENT_GAP_BELOW_HEADER = 20;
const H_PADDING = 20;
/** Max width for welcome heading + subtitle copy. */
const MAX_TEXT_WIDTH = 360;
const WIDE_LAYOUT_MIN_WIDTH = 480;
const GAP_ABOVE_AUTH_BUTTONS = 20;

/** Wide headline metrics — keep in StyleSheet so RN-web emits stable classes. */
const HEADING_FONT_WIDE = 35;
/** Thin screens: heading line height; wide screens use {@link HEADING_LINE_WIDE}. */
const HEADING_LINE_NARROW = 30;
const HEADING_LINE_WIDE = 40;

/**
 * Welcome screen: top header is rendered by GlobalLogoBar (marketing vs default by route + TMA mode).
 */
export default function WelcomeScreen() {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();

  const isWideLayout = windowWidth > WIDE_LAYOUT_MIN_WIDTH;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.content,
          { paddingHorizontal: H_PADDING, paddingTop: CONTENT_GAP_BELOW_HEADER },
        ]}
      >
        <View style={styles.headingBlock}>
          <Text
            style={[
              styles.headingText,
              isWideLayout ? styles.headingTextWide : styles.headingTextNarrow,
              { color: colors.primary },
            ]}
          >
            Welcome to our program
          </Text>
        </View>
        <View style={styles.subtitleBlock}>
          <Text
            style={[
              styles.subtitleText,
              { color: colors.secondary, lineHeight: Math.round(15 * 1.35) },
            ]}
          >
            This is the best way to earn and spend
          </Text>
        </View>
        <View style={styles.authBlock}>
          <WelcomeAuthButtons />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    alignItems: "center",
  },
  subtitleBlock: {
    width: "100%",
    maxWidth: MAX_TEXT_WIDTH,
  },
  subtitleText: {
    fontSize: 15,
    fontWeight: "400",
    textAlign: "center",
    includeFontPadding: false,
    paddingVertical: 0,
  },
  headingBlock: {
    width: "100%",
    maxWidth: MAX_TEXT_WIDTH,
  },
  headingText: {
    fontWeight: "400",
    textAlign: "center",
    includeFontPadding: false,
    paddingVertical: 0,
    width: "100%",
    flexShrink: 0,
  },
  headingTextWide: {
    fontSize: HEADING_FONT_WIDE,
    lineHeight: HEADING_LINE_WIDE,
  },
  headingTextNarrow: {
    fontSize: 25,
    lineHeight: HEADING_LINE_NARROW,
  },
  authBlock: {
    width: "100%",
    maxWidth: MAX_TEXT_WIDTH,
    marginTop: GAP_ABOVE_AUTH_BUTTONS,
    alignItems: "center",
  },
});

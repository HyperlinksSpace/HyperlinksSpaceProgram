import { useMemo, useState } from "react";
import { Platform, PixelRatio, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { useAppStrings } from "../../../locales/AppStringsContext";
import {
  layout,
  typographyRect15,
  useColors,
  welcomeAuthButtonActiveBackground,
  welcomeAuthButtonHoverBackground,
} from "../../theme";
import { useTelegram } from "../Telegram";
import { SwapFilterIcon } from "../icons/SwapFilterIcon";

/** Matches {@link AuthenticatedHomeLeftNavStrip} total strip height. */
export const CHOOSE_CURRENCY_SUBHEADER_HEIGHT_PX = 55;
const STRIP_PADDING_PX = layout.contentSideInsetPx;
const INNER_ROW_HEIGHT_PX = CHOOSE_CURRENCY_SUBHEADER_HEIGHT_PX - STRIP_PADDING_PX * 2;

const TITLE_FONT_SIZE_PX = 20;
const TITLE_LINE_HEIGHT_PX = 25;

const BACK_BUTTON_HEIGHT_PX = 30;
const BACK_BUTTON_HORIZONTAL_PADDING_PX = 15;

function menuStripRuleThickness(): number {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.devicePixelRatio > 0) {
      return 1 / window.devicePixelRatio;
    }
    return 1;
  }
  return PixelRatio.roundToNearestPixel(1 / PixelRatio.get());
}

type Props = {
  onBackPress?: () => void;
  onFilterPress?: () => void;
  showBack?: boolean;
  showFilter?: boolean;
  titleAlign?: "left" | "center";
};

export function ChooseCurrencySubheader({
  onBackPress,
  onFilterPress,
  showBack = true,
  showFilter = true,
  titleAlign = "center",
}: Props) {
  const { t } = useAppStrings();
  const colors = useColors();
  const { colorScheme } = useTelegram();
  const [hoverBack, setHoverBack] = useState(false);
  const lineT = menuStripRuleThickness();

  const borderLineStyle = useMemo((): ViewStyle => {
    return {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: lineT,
      backgroundColor: colors.highlight,
      zIndex: 1,
    };
  }, [colors.highlight, lineT]);

  const titleStyle = [
    styles.title,
    {
      color: colors.primary,
      textAlign: titleAlign,
    },
  ] as const;

  return (
    <View style={styles.strip}>
      <View style={styles.row}>
        {showBack ? (
          <View style={styles.leftSlot}>
            <Pressable
              onPress={onBackPress}
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              onHoverIn={Platform.OS === "web" ? () => setHoverBack(true) : undefined}
              onHoverOut={Platform.OS === "web" ? () => setHoverBack(false) : undefined}
              style={({ pressed }) => {
                const webHover = Platform.OS === "web" && hoverBack;
                let backgroundColor = colors.undercover;
                if (pressed) {
                  backgroundColor = welcomeAuthButtonActiveBackground(colors, colorScheme);
                } else if (webHover) {
                  backgroundColor = welcomeAuthButtonHoverBackground(colors, colorScheme);
                }
                return [
                  styles.backButton,
                  {
                    backgroundColor,
                    opacity: pressed ? 0.92 : 1,
                  },
                ];
              }}
            >
              <Text style={[typographyRect15, { color: colors.primary }]} numberOfLines={1}>
                {t("common.back")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.sideSlotSpacer} />
        )}

        <View style={[styles.titleWrap, titleAlign === "left" ? styles.titleWrapLeft : null]}>
          <Text style={titleStyle} numberOfLines={1}>
            {t("swap.chooseCurrency.title")}
          </Text>
        </View>

        {showFilter ? (
          <View style={styles.rightSlot}>
            <Pressable
              onPress={onFilterPress}
              accessibilityRole="button"
              accessibilityLabel={t("swap.chooseCurrency.filterA11y")}
              hitSlop={8}
              style={styles.filterPressable}
            >
              <SwapFilterIcon color={colors.primary} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.sideSlotSpacer} />
        )}
      </View>
      <View pointerEvents="none" style={borderLineStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: "100%",
    alignSelf: "stretch",
    height: CHOOSE_CURRENCY_SUBHEADER_HEIGHT_PX,
    paddingTop: STRIP_PADDING_PX,
    paddingBottom: STRIP_PADDING_PX,
    position: "relative",
    overflow: "visible",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: INNER_ROW_HEIGHT_PX,
    width: "100%",
    paddingHorizontal: STRIP_PADDING_PX,
  },
  leftSlot: {
    zIndex: 2,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  rightSlot: {
    zIndex: 2,
    marginLeft: "auto",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  sideSlotSpacer: {
    width: 0,
    minWidth: 0,
    flexShrink: 0,
  },
  backButton: {
    height: BACK_BUTTON_HEIGHT_PX,
    paddingHorizontal: BACK_BUTTON_HORIZONTAL_PADDING_PX,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  filterPressable: {
    minWidth: 20,
    minHeight: INNER_ROW_HEIGHT_PX,
    justifyContent: "center",
    alignItems: "center",
  },
  titleWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: 72,
    pointerEvents: "none",
  },
  titleWrapLeft: {
    alignItems: "flex-start",
    paddingLeft: STRIP_PADDING_PX,
    paddingRight: 72,
  },
  title: {
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: TITLE_FONT_SIZE_PX,
    lineHeight: TITLE_LINE_HEIGHT_PX,
    fontWeight: "400",
    width: "100%",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});

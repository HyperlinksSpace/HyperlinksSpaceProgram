import { useCallback, useId, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useAppStrings } from "../../locales/AppStringsContext";
import { authenticatedHomeBottomBarDock, layout, typographyRect15, useColors } from "../theme";
import { useAuth } from "../../auth/AuthContext";
import { useResolvedPathname } from "../useResolvedPathname";
import { useTelegramMessagesConnection } from "../telegram/TelegramMessagesConnectionContext";
import { useBottomBarLayout } from "./BottomBarLayoutContext";
import { useTelegram } from "./Telegram";
import { SettingsIcon } from "./icons/SettingsIcon";
import { ShieldIcon } from "./icons/ShieldIcon";
import { TelegramLogoIcon } from "./icons/TelegramLogoIcon";
import { LiquidGlassShaderUndercover } from "./LiquidGlassShaderUndercover";

const STRIP_HEIGHT_PX = 60;
const CHIP_SIZE_PX = 40;
const ICON_SIZE_PX = 20;
const SHIELD_ICON_WIDTH_PX = 20;
const SHIELD_ICON_HEIGHT_PX = 22;
const LOGO_SIZE_PX = 20;
const PILL_WIDTH_PX = 193;
const PILL_HEIGHT_PX = 40;

const PILL_LOGO_LEFT_PX = 15;
const PILL_LOGO_TO_TEXT_GAP_PX = 10;
const PILL_TEXT_RIGHT_PX = 20;

type Props = {
  onConnectPress?: () => void;
  onPowerPress?: () => void;
  onSettingsPress?: () => void;
};

function StripBackgroundGradient({
  width,
  height,
  backgroundColor,
}: {
  width: number;
  height: number;
  backgroundColor: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  if (width <= 0) return null;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={backgroundColor} stopOpacity={0} />
          <Stop offset="100%" stopColor={backgroundColor} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${gradientId})`} />
    </Svg>
  );
}

/**
 * Floating 60px overlay above the AI & Search top divider when Telegram message streaming is disconnected (mobile).
 * Does not consume layout space — content scrolls underneath the gradient underlay.
 */
export function TelegramConnectFooterStrip({
  onConnectPress,
  onPowerPress,
  onSettingsPress,
}: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const pathname = useResolvedPathname();
  const { isAuthenticated } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const { isTelegramMessagesConnected } = useTelegramMessagesConnection();
  const { barHeight: bottomBarHeight, footerDockedToScreenEdge } = useBottomBarLayout();
  const { isInTelegram, layoutStartup } = useTelegram();
  const bottomBarDock = authenticatedHomeBottomBarDock(pathname, windowWidth, isAuthenticated);

  const hideBottomBorder =
    (isInTelegram && !layoutStartup.isTelegramMiniAppDesktop) || !footerDockedToScreenEdge;
  /** Sit above the footer top rule; `barHeight` excludes wrapper borders. */
  const stripBottomOffsetPx =
    bottomBarHeight +
    layout.bottomBar.topRuleHeightPx +
    (hideBottomBorder ? 0 : layout.bottomBar.bottomRuleHeightPx);

  const isAuthenticatedHome =
    isAuthenticated && (pathname === "/" || pathname === "" || pathname == null);
  const isNarrowHome =
    isAuthenticatedHome && bottomBarDock === "screenFooter" && windowWidth <= layout.authenticatedHome.firstBreakpoint;

  const label = t("home.mainColumnFooter.telegramMessages");
  const isLightTheme = colors.primary === "#000000";
  const iconColor = colors.primary;
  const powerColor = isLightTheme ? "#000000" : "#FFFFFF";
  const [stripWidth, setStripWidth] = useState(0);

  const onStripLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.width);
    setStripWidth((current) => (current === next ? current : next));
  }, []);

  if (!isNarrowHome || isTelegramMessagesConnected || !footerDockedToScreenEdge) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.overlayHost, { bottom: stripBottomOffsetPx }]}>
      <View
        onLayout={onStripLayout}
        style={styles.strip}
        pointerEvents="box-none"
      >
        <View style={styles.blockUndercover} pointerEvents="none">
          <StripBackgroundGradient
            width={stripWidth}
            height={STRIP_HEIGHT_PX}
            backgroundColor={colors.background}
          />
        </View>

        <View style={[styles.row, { paddingHorizontal: layout.contentSideInsetPx }]}>
          <Pressable accessibilityRole="button" onPress={onPowerPress} style={styles.chipPressable}>
            <LiquidGlassShaderUndercover size={CHIP_SIZE_PX} phaseOffset={0.41} isLightTheme={isLightTheme}>
              <ShieldIcon
                powerColor={powerColor}
                width={SHIELD_ICON_WIDTH_PX}
                height={SHIELD_ICON_HEIGHT_PX}
              />
            </LiquidGlassShaderUndercover>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onConnectPress} style={styles.pillPressable}>
            <LiquidGlassShaderUndercover
              shape="pill"
              width={PILL_WIDTH_PX}
              height={PILL_HEIGHT_PX}
              contentInsetPx={0}
              phaseOffset={0.22}
              isLightTheme={isLightTheme}
            >
              <View style={styles.pillContent}>
                <TelegramLogoIcon size={LOGO_SIZE_PX} />
                <Text
                  style={[typographyRect15, styles.pillLabel, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            </LiquidGlassShaderUndercover>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onSettingsPress} style={styles.chipPressable}>
            <LiquidGlassShaderUndercover size={CHIP_SIZE_PX} phaseOffset={0.08} isLightTheme={isLightTheme}>
              <SettingsIcon color={iconColor} size={ICON_SIZE_PX} />
            </LiquidGlassShaderUndercover>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayHost: {
    position: "absolute",
    left: 0,
    right: 0,
    width: "100%",
    height: STRIP_HEIGHT_PX,
    zIndex: 999,
    elevation: 999,
  },
  strip: {
    width: "100%",
    height: STRIP_HEIGHT_PX,
    maxHeight: STRIP_HEIGHT_PX,
    position: "relative",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      web: { boxSizing: "border-box" as const },
      default: {},
    }),
  },
  blockUndercover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: PILL_HEIGHT_PX,
    zIndex: 1,
  },
  chipPressable: {
    width: CHIP_SIZE_PX,
    height: CHIP_SIZE_PX,
    flexShrink: 0,
  },
  pillPressable: {
    width: PILL_WIDTH_PX,
    height: PILL_HEIGHT_PX,
    minWidth: PILL_WIDTH_PX,
    minHeight: PILL_HEIGHT_PX,
    flexShrink: 0,
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    width: PILL_WIDTH_PX,
    minWidth: PILL_WIDTH_PX,
    height: PILL_HEIGHT_PX,
    minHeight: PILL_HEIGHT_PX,
    paddingLeft: PILL_LOGO_LEFT_PX,
    paddingRight: PILL_TEXT_RIGHT_PX,
    gap: PILL_LOGO_TO_TEXT_GAP_PX,
  },
  pillLabel: {
    flexShrink: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
  },
});

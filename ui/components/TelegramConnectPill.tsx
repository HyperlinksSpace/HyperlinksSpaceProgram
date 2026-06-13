import { useEffect, useMemo, useState, type NativeSyntheticEvent, type TextLayoutEventData } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useAppStrings } from "../../locales/AppStringsContext";
import { layout, typographyRect15, useColors } from "../theme";
import { TelegramLogoIcon } from "./icons/TelegramLogoIcon";
import { LiquidGlassShaderUndercover } from "./LiquidGlassShaderUndercover";
import { logTelegramConnect } from "../telegram/telegramConnectDebug";
import {
  measureTelegramConnectPillLabelLineWidthPx,
  TELEGRAM_CONNECT_PILL_LOGO_LEFT_PX,
  TELEGRAM_CONNECT_PILL_LOGO_SIZE_PX,
  TELEGRAM_CONNECT_PILL_LOGO_TO_TEXT_GAP_PX,
  TELEGRAM_CONNECT_PILL_TEXT_RIGHT_PX,
  telegramConnectMaxPillWidthInStripPx,
  telegramConnectPillWidthFromLabelLinePx,
} from "./telegramConnectPillMeasure";

const PILL_HEIGHT_PX = 40;

type Props = {
  onPress?: () => void;
  /** Max width context for strip layout (viewport minus chips). */
  maxStripWidthPx?: number;
  phaseOffset?: number;
};

/**
 * “Connect Telegram” liquid-glass pill — shared by narrow footer strip and wide column footer.
 */
export function TelegramConnectPill({ onPress, maxStripWidthPx, phaseOffset = 0.22 }: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const label = t("home.mainColumnFooter.telegramMessages");
  const isLightTheme = colors.primary === "#000000";

  const [stripWidth, setStripWidth] = useState(maxStripWidthPx ?? 0);
  const [nativeLabelLineWidth, setNativeLabelLineWidth] = useState(0);

  useEffect(() => {
    if (maxStripWidthPx != null) setStripWidth(maxStripWidthPx);
  }, [maxStripWidthPx]);

  const onStripLayout = (event: LayoutChangeEvent) => {
    if (maxStripWidthPx == null) {
      const next = Math.ceil(event.nativeEvent.layout.width);
      setStripWidth((current) => (current === next ? current : next));
    }
  };

  const onNativeLabelTextLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const lineWidth = Math.ceil(event.nativeEvent.lines[0]?.width ?? 0);
    setNativeLabelLineWidth((current) => (current === lineWidth ? current : lineWidth));
  };

  useEffect(() => {
    setNativeLabelLineWidth(0);
  }, [label]);

  const webLabelLineWidth = useMemo(
    () => (Platform.OS === "web" ? measureTelegramConnectPillLabelLineWidthPx(label) : 0),
    [label],
  );

  const maxPillWidthPx = telegramConnectMaxPillWidthInStripPx(
    stripWidth,
    0,
    layout.contentSideInsetPx,
  );

  const labelLineWidth = Platform.OS === "web" ? webLabelLineWidth : nativeLabelLineWidth;

  const pillWidth = useMemo(() => {
    if (!label || stripWidth <= 0 || labelLineWidth <= 0) return 0;
    return telegramConnectPillWidthFromLabelLinePx(labelLineWidth, maxPillWidthPx);
  }, [label, stripWidth, labelLineWidth, maxPillWidthPx]);

  useEffect(() => {
    logTelegramConnect("pill_layout", {
      pillWidth,
      stripWidth,
      labelLineWidth,
      hasOnPress: typeof onPress === "function",
      maxStripWidthPx,
    });
  }, [pillWidth, stripWidth, labelLineWidth, onPress, maxStripWidthPx]);

  const handlePress = () => {
    logTelegramConnect("pill_press", {
      hasHandler: typeof onPress === "function",
      pillWidth,
    });
    if (onPress) {
      onPress();
    } else {
      logTelegramConnect("pill_press_no_handler");
    }
  };

  useEffect(() => {
    if (pillWidth <= 0) {
      logTelegramConnect("pill_not_rendered", {
        reason: "pillWidth_zero",
        stripWidth,
        labelLineWidth,
        label,
      });
    }
  }, [pillWidth, stripWidth, labelLineWidth, label]);

  if (pillWidth <= 0) {
    return (
      <View onLayout={onStripLayout} style={{ alignSelf: "stretch", minHeight: PILL_HEIGHT_PX }}>
        {Platform.OS !== "web" ? (
          <Text
            key={label}
            style={[typographyRect15, { position: "absolute", opacity: 0, top: -10000 }]}
            numberOfLines={1}
            onTextLayout={onNativeLabelTextLayout}
          >
            {label}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View onLayout={onStripLayout} style={{ width: "100%" }}>
      {Platform.OS !== "web" ? (
        <Text
          key={label}
          style={[typographyRect15, { position: "absolute", opacity: 0, top: -10000 }]}
          numberOfLines={1}
          onTextLayout={onNativeLabelTextLayout}
        >
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={handlePress}
        style={{ width: pillWidth, height: PILL_HEIGHT_PX, minHeight: PILL_HEIGHT_PX, flexShrink: 0 }}
      >
        <LiquidGlassShaderUndercover
          key={`${label}-${pillWidth}`}
          shape="pill"
          width={pillWidth}
          height={PILL_HEIGHT_PX}
          contentInsetPx={0}
          phaseOffset={phaseOffset}
          isLightTheme={isLightTheme}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              height: PILL_HEIGHT_PX,
              minHeight: PILL_HEIGHT_PX,
              paddingLeft: TELEGRAM_CONNECT_PILL_LOGO_LEFT_PX,
              paddingRight: TELEGRAM_CONNECT_PILL_TEXT_RIGHT_PX,
              gap: TELEGRAM_CONNECT_PILL_LOGO_TO_TEXT_GAP_PX,
              width: pillWidth,
            }}
          >
            <View
              style={{
                width: TELEGRAM_CONNECT_PILL_LOGO_SIZE_PX,
                height: TELEGRAM_CONNECT_PILL_LOGO_SIZE_PX,
                flexShrink: 0,
              }}
            >
              <TelegramLogoIcon size={TELEGRAM_CONNECT_PILL_LOGO_SIZE_PX} />
            </View>
            <Text
              style={[typographyRect15, { color: colors.primary, flexShrink: 1, minWidth: 0 }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </LiquidGlassShaderUndercover>
      </Pressable>
    </View>
  );
}

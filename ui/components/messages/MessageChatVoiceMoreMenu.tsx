import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, type ThemeColors } from "../../theme";
import { resolveFloatingDialogViewportInsets } from "../floatingDialogChrome";
import { clampAnchoredMenuPosition } from "../floatingDialogGeometry";
import { useTelegram } from "../Telegram";

export type VoiceMoreMenuAnchor = {
  x: number;
  y: number;
  /**
   * `above` keeps the menu from being pushed down into the viewport over its trigger.
   */
  side?: "below" | "above";
};

export type VoiceMoreMenuItem = {
  key: string;
  label: string;
  disabled?: boolean;
  /** When true, show a checkmark trailing the label (filter / choice menus). */
  selected?: boolean;
  onPress?: () => void;
};

const MENU_PADDING_PX = 15;
const MENU_ITEM_HEIGHT_PX = 15;
const MENU_ITEM_GAP_PX = 20;
const MENU_MIN_WIDTH_PX = 120;

type Props = {
  visible: boolean;
  anchor: VoiceMoreMenuAnchor | null;
  colors: ThemeColors;
  items: VoiceMoreMenuItem[];
  onClose: () => void;
};

function menuHeightPx(itemCount: number): number {
  const items = Math.max(1, itemCount);
  return (
    MENU_PADDING_PX * 2 +
    MENU_ITEM_HEIGHT_PX * items +
    MENU_ITEM_GAP_PX * Math.max(0, items - 1)
  );
}

function clampMenuPosition(
  anchor: VoiceMoreMenuAnchor,
  menuWidth: number,
  menuHeight: number,
  windowWidth: number,
  windowHeight: number,
  insets: ReturnType<typeof resolveFloatingDialogViewportInsets>,
): { left: number; top: number } {
  // Prefer the anchor Y (including `above`); still keep the panel inside TMA-safe bounds.
  return clampAnchoredMenuPosition({
    left: anchor.x,
    top: anchor.y,
    menuWidth,
    menuHeight,
    windowWidth,
    windowHeight,
    insets,
  });
}

function ContextMenuDivider({ color }: { color: string }) {
  const gradientId = useId();
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View
      style={{
        height: MENU_ITEM_GAP_PX,
        justifyContent: "center",
        alignSelf: "stretch",
      }}
      onLayout={onLayout}
    >
      {width > 0 ? (
        <Svg width={width} height={1} viewBox={`0 0 ${width} 1`}>
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0" x2="100%" y2="0">
              <Stop offset="0%" stopColor={color} stopOpacity={0} />
              <Stop offset="50%" stopColor={color} stopOpacity={1} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={1} fill={`url(#${gradientId})`} />
        </Svg>
      ) : null}
    </View>
  );
}

function VoiceMoreMenuPanel({
  colors,
  items,
  onLayout,
}: {
  colors: ThemeColors;
  items: VoiceMoreMenuItem[];
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const textStyle = useMemo(
    () => [
      typographyRect15,
      {
        color: colors.primary,
        height: MENU_ITEM_HEIGHT_PX,
        lineHeight: MENU_ITEM_HEIGHT_PX,
        fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
        includeFontPadding: false,
        textAlign: "left" as const,
      },
    ],
    [colors.primary],
  );

  return (
    <View
      onLayout={onLayout}
      style={{
        minWidth: MENU_MIN_WIDTH_PX,
        padding: MENU_PADDING_PX,
        backgroundColor: colors.undercover,
        borderWidth: 1,
        borderColor: colors.highlight,
        alignSelf: "flex-start",
        ...Platform.select({
          web: { boxSizing: "border-box" as const },
          default: {},
        }),
      }}
    >
      {items.map((item, index) => (
        <View key={item.key}>
          {index > 0 ? <ContextMenuDivider color={colors.highlight} /> : null}
          <Pressable
            onPress={() => {
              if (item.disabled) return;
              item.onPress?.();
            }}
            disabled={item.disabled}
            accessibilityState={{ selected: Boolean(item.selected), disabled: Boolean(item.disabled) }}
            style={({ pressed }) => ({
              height: MENU_ITEM_HEIGHT_PX,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              opacity: item.disabled ? 0.45 : pressed ? 0.7 : 1,
            })}
          >
            <Text style={[textStyle, { flexShrink: 1, minWidth: 0 }]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.selected ? (
              <Text
                style={[
                  textStyle,
                  {
                    flexShrink: 0,
                    textAlign: "right",
                  },
                ]}
                accessibilityLabel="Selected"
              >
                ✓
              </Text>
            ) : null}
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function MessageChatVoiceMoreMenuNative({
  visible,
  anchor,
  colors,
  items,
  onClose,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { safeAreaInsetTop, contentSafeAreaInsetTop, isInTelegram } = useTelegram();
  const viewportInsets = useMemo(
    () =>
      resolveFloatingDialogViewportInsets({
        windowWidth,
        safeAreaInsetTop,
        contentSafeAreaInsetTop,
        inTelegram: isInTelegram,
      }),
    [contentSafeAreaInsetTop, safeAreaInsetTop, windowWidth],
  );
  const [menuWidth, setMenuWidth] = useState(MENU_MIN_WIDTH_PX);
  const menuHeight = menuHeightPx(items.length);
  const position =
    anchor != null
      ? clampMenuPosition(
          anchor,
          menuWidth,
          menuHeight,
          windowWidth,
          windowHeight,
          viewportInsets,
        )
      : { left: viewportInsets.left, top: viewportInsets.top };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: position.left,
            top: position.top,
          }}
        >
          <VoiceMoreMenuPanel
            colors={colors}
            items={items}
            onLayout={(event) => {
              const next = Math.ceil(event.nativeEvent.layout.width);
              if (next > 0) setMenuWidth(next);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function MessageChatVoiceMoreMenuWeb({
  visible,
  anchor,
  colors,
  items,
  onClose,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { safeAreaInsetTop, contentSafeAreaInsetTop, isInTelegram } = useTelegram();
  const viewportInsets = useMemo(
    () =>
      resolveFloatingDialogViewportInsets({
        windowWidth,
        safeAreaInsetTop,
        contentSafeAreaInsetTop,
        inTelegram: isInTelegram,
      }),
    [contentSafeAreaInsetTop, safeAreaInsetTop, windowWidth],
  );
  const [menuWidth, setMenuWidth] = useState(MENU_MIN_WIDTH_PX);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const menuHeight = menuHeightPx(items.length);

  useEffect(() => {
    if (typeof document !== "undefined") {
      setPortalTarget(document.body);
    }
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, visible]);

  if (!visible || !anchor || !portalTarget) return null;

  const position = clampMenuPosition(
    anchor,
    menuWidth,
    menuHeight,
    windowWidth,
    windowHeight,
    viewportInsets,
  );

  return createPortal(
    <View
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        // Above the voice dialog portal (9000) so menu stays clickable.
        zIndex: 10050,
      }}
      pointerEvents="box-none"
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        pointerEvents="box-none"
        style={{
          position: "fixed",
          left: position.left,
          top: position.top,
        }}
      >
        <VoiceMoreMenuPanel
          colors={colors}
          items={items}
          onLayout={(event) => {
            const next = Math.ceil(event.nativeEvent.layout.width);
            if (next > 0) setMenuWidth(next);
          }}
        />
      </View>
    </View>,
    portalTarget,
  );
}

/** Same visual language as the message right-click menu, for the voice dialog ⋯ chip. */
export function MessageChatVoiceMoreMenu(props: Props) {
  if (Platform.OS === "web") {
    return <MessageChatVoiceMoreMenuWeb {...props} />;
  }
  return <MessageChatVoiceMoreMenuNative {...props} />;
}

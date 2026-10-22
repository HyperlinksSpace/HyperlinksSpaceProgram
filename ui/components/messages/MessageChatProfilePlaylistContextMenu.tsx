import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
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
import Svg, { Path } from "react-native-svg";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, type ThemeColors } from "../../theme";
import { resolveFloatingDialogViewportInsets } from "../floatingDialogChrome";
import { clampAnchoredMenuPosition } from "../floatingDialogGeometry";
import { useTelegram } from "../Telegram";
import { ChatMenuDeleteIcon } from "./MessageChatListContextMenuIcons";

export type PlaylistMenuAnchor = { x: number; y: number };

type MenuIcon = ComponentType<{ color: string; size?: number }>;

type MenuItem = {
  key: string;
  label: string;
  Icon: MenuIcon;
  destructive?: boolean;
  onPress: () => void;
};

const MENU_PADDING_PX = 8;
const MENU_ITEM_HEIGHT_PX = 32;
const MENU_ICON_PX = 18;
const MENU_MIN_WIDTH_PX = 180;
const DESTRUCTIVE_COLOR = "#e53935";
/** Above playlist sheet (10150). */
const MENU_Z = 10220;

function PlaylistSaveAsIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4v10"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Path
        d="M8.5 10.5 12 14l3.5-3.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 18h14"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PlaylistForwardIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 7.5 19 12l-5 4.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 12h14"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function menuHeightPx(count: number): number {
  return MENU_PADDING_PX * 2 + MENU_ITEM_HEIGHT_PX * Math.max(1, count);
}

function MenuPanel({
  colors,
  items,
  onLayout,
  onClose,
}: {
  colors: ThemeColors;
  items: MenuItem[];
  onLayout?: (event: LayoutChangeEvent) => void;
  onClose: () => void;
}) {
  const textStyle = useMemo(
    () => [
      typographyRect15,
      {
        flex: 1,
        fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
        includeFontPadding: false,
        textAlign: "left" as const,
      },
    ],
    [],
  );

  return (
    <View
      onLayout={onLayout}
      style={{
        minWidth: MENU_MIN_WIDTH_PX,
        paddingVertical: MENU_PADDING_PX,
        paddingHorizontal: 10,
        backgroundColor: colors.undercover,
        borderWidth: 1,
        borderColor: colors.highlight,
        alignSelf: "flex-start",
        ...Platform.select({
          web: {
            boxSizing: "border-box" as const,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          },
          default: {},
        }),
      }}
    >
      {items.map((item) => {
        const color = item.destructive ? DESTRUCTIVE_COLOR : colors.primary;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={({ pressed }) => ({
              minHeight: MENU_ITEM_HEIGHT_PX,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ width: 22, alignItems: "center", justifyContent: "center" }}>
              <item.Icon color={color} size={MENU_ICON_PX} />
            </View>
            <Text numberOfLines={1} style={[textStyle, { color }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type Props = {
  visible: boolean;
  anchor: PlaylistMenuAnchor | null;
  colors: ThemeColors;
  canDelete: boolean;
  onClose: () => void;
  onSaveAs: () => void;
  onForward: () => void;
  onDelete: () => void;
};

export function MessageChatProfilePlaylistContextMenu({
  visible,
  anchor,
  colors,
  canDelete,
  onClose,
  onSaveAs,
  onForward,
  onDelete,
}: Props) {
  const { t } = useAppStrings();
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

  const items = useMemo((): MenuItem[] => {
    const next: MenuItem[] = [
      {
        key: "saveAs",
        label: t("messages.action.saveAs"),
        Icon: PlaylistSaveAsIcon,
        onPress: onSaveAs,
      },
      {
        key: "forward",
        label: t("messages.action.forward"),
        Icon: PlaylistForwardIcon,
        onPress: onForward,
      },
    ];
    if (canDelete) {
      next.push({
        key: "delete",
        label: t("messages.action.delete"),
        Icon: ChatMenuDeleteIcon,
        destructive: true,
        onPress: onDelete,
      });
    }
    return next;
  }, [canDelete, onDelete, onForward, onSaveAs, t]);

  useEffect(() => {
    if (typeof document !== "undefined") setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, visible]);

  const menuHeight = menuHeightPx(items.length);
  const position =
    anchor != null
      ? clampAnchoredMenuPosition({
          left: anchor.x,
          top: anchor.y,
          menuWidth,
          menuHeight,
          windowWidth,
          windowHeight,
          insets: viewportInsets,
        })
      : null;

  const panel = (
    <MenuPanel
      colors={colors}
      items={items}
      onClose={onClose}
      onLayout={(event) => {
        const next = Math.ceil(event.nativeEvent.layout.width);
        if (next > 0) setMenuWidth(next);
      }}
    />
  );

  if (!visible || !anchor || !position) return null;

  if (Platform.OS === "web") {
    if (!portalTarget) return null;
    return createPortal(
      <View
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: MENU_Z,
        }}
        pointerEvents="box-none"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          pointerEvents="box-none"
          style={{ position: "fixed", left: position.left, top: position.top }}
        >
          {panel}
        </View>
      </View>,
      portalTarget,
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={{ position: "absolute", left: position.left, top: position.top }}>{panel}</View>
    </Modal>
  );
}

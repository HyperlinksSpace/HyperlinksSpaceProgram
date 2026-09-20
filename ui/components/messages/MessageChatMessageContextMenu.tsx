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
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, type ThemeColors } from "../../theme";
import { resolveFloatingDialogViewportInsets } from "../floatingDialogChrome";
import { clampAnchoredMenuPosition } from "../floatingDialogGeometry";
import { useTelegram } from "../Telegram";

export type MessageContextMenuAnchor = {
  x: number;
  y: number;
};

const MENU_PADDING_PX = 15;
const MENU_ITEM_HEIGHT_PX = 15;
const MENU_ITEM_GAP_PX = 20;
const MENU_MIN_WIDTH_PX = 120;

type Props = {
  visible: boolean;
  anchor: MessageContextMenuAnchor | null;
  colors: ThemeColors;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function menuItemCount(canEdit: boolean, canDelete: boolean): number {
  return 1 + (canEdit ? 1 : 0) + (canDelete ? 1 : 0);
}

function menuHeightPx(canEdit: boolean, canDelete: boolean): number {
  const items = menuItemCount(canEdit, canDelete);
  return MENU_PADDING_PX * 2 + MENU_ITEM_HEIGHT_PX * items + MENU_ITEM_GAP_PX * Math.max(0, items - 1);
}

function clampMenuPosition(
  anchor: MessageContextMenuAnchor,
  menuWidth: number,
  menuHeight: number,
  windowWidth: number,
  windowHeight: number,
  insets: ReturnType<typeof resolveFloatingDialogViewportInsets>,
): { left: number; top: number } {
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

function ContextMenuPanel({
  colors,
  canEdit,
  canDelete,
  onReply,
  onEdit,
  onDelete,
  onLayout,
}: {
  colors: ThemeColors;
  canEdit: boolean;
  canDelete: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { t } = useAppStrings();
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
      <Pressable
        onPress={onReply}
        style={({ pressed }) => ({
          height: MENU_ITEM_HEIGHT_PX,
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={textStyle}>{t("messages.action.reply")}</Text>
      </Pressable>
      {canEdit ? (
        <>
          <ContextMenuDivider color={colors.highlight} />
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => ({
              height: MENU_ITEM_HEIGHT_PX,
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={textStyle}>{t("messages.action.edit")}</Text>
          </Pressable>
        </>
      ) : null}
      {canDelete ? (
        <>
          <ContextMenuDivider color={colors.highlight} />
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => ({
              height: MENU_ITEM_HEIGHT_PX,
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={textStyle}>{t("messages.action.delete")}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function MessageChatMessageContextMenuNative({
  visible,
  anchor,
  colors,
  canEdit,
  canDelete,
  onClose,
  onReply,
  onEdit,
  onDelete,
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
  const menuHeight = menuHeightPx(canEdit, canDelete);
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
          <ContextMenuPanel
            colors={colors}
            canEdit={canEdit}
            canDelete={canDelete}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
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

function MessageChatMessageContextMenuWeb({
  visible,
  anchor,
  colors,
  canEdit,
  canDelete,
  onClose,
  onReply,
  onEdit,
  onDelete,
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
  const menuHeight = menuHeightPx(canEdit, canDelete);

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
        zIndex: 10000,
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
        <ContextMenuPanel
          colors={colors}
          canEdit={canEdit}
          canDelete={canDelete}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
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

export function MessageChatMessageContextMenu(props: Props) {
  if (Platform.OS === "web") {
    return <MessageChatMessageContextMenuWeb {...props} />;
  }
  return <MessageChatMessageContextMenuNative {...props} />;
}

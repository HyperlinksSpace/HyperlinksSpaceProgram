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

export type MessageSaveAudioTarget = "profile" | "saved_messages" | "downloads";

const MENU_PADDING_PX = 15;
const MENU_ITEM_HEIGHT_PX = 15;
const MENU_ITEM_GAP_PX = 20;
const MENU_MIN_WIDTH_PX = 120;
const SUBMENU_HINT_LINE_HEIGHT_PX = 14;
const SUBMENU_HINT_GAP_PX = 10;

type Props = {
  visible: boolean;
  anchor: MessageContextMenuAnchor | null;
  colors: ThemeColors;
  canEdit: boolean;
  canDelete: boolean;
  /** messageAudio — show Save to… + Copy Filename. */
  canSaveAudio: boolean;
  onClose: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyFilename: () => void;
  onSaveAudio: (target: MessageSaveAudioTarget) => void;
};

function menuItemCount(canEdit: boolean, canDelete: boolean, canSaveAudio: boolean): number {
  // Reply + (Save to) + (Copy Filename) + (Edit) + (Delete)
  return 1 + (canSaveAudio ? 2 : 0) + (canEdit ? 1 : 0) + (canDelete ? 1 : 0);
}

function menuHeightPx(canEdit: boolean, canDelete: boolean, canSaveAudio: boolean): number {
  const items = menuItemCount(canEdit, canDelete, canSaveAudio);
  return MENU_PADDING_PX * 2 + MENU_ITEM_HEIGHT_PX * items + MENU_ITEM_GAP_PX * Math.max(0, items - 1);
}

function submenuHeightPx(): number {
  // Profile / Saved Messages / Downloads + divider gap + hint (~2 lines)
  const items = 3;
  const hintBlock =
    SUBMENU_HINT_GAP_PX + SUBMENU_HINT_LINE_HEIGHT_PX * 2 + MENU_PADDING_PX;
  return (
    MENU_PADDING_PX * 2 +
    MENU_ITEM_HEIGHT_PX * items +
    MENU_ITEM_GAP_PX * Math.max(0, items - 1) +
    hintBlock
  );
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

function MenuItemLabel({
  label,
  colors,
  trailing,
}: {
  label: string;
  colors: ThemeColors;
  trailing?: string;
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
        flexShrink: 1,
      },
    ],
    [colors.primary],
  );
  return (
    <View
      style={{
        height: MENU_ITEM_HEIGHT_PX,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text style={textStyle} numberOfLines={1}>
        {label}
      </Text>
      {trailing ? (
        <Text
          style={[
            textStyle,
            { color: colors.secondary, flexShrink: 0 },
          ]}
        >
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

function SaveToSubmenuPanel({
  colors,
  onSave,
}: {
  colors: ThemeColors;
  onSave: (target: MessageSaveAudioTarget) => void;
}) {
  const { t } = useAppStrings();
  const hintStyle = useMemo(
    () => ({
      color: colors.secondary,
      fontSize: 12,
      lineHeight: SUBMENU_HINT_LINE_HEIGHT_PX,
      fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
      includeFontPadding: false as const,
    }),
    [colors.secondary],
  );

  return (
    <View
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
        onPress={() => onSave("profile")}
        style={({ pressed, hovered }) => ({
          height: MENU_ITEM_HEIGHT_PX,
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
          backgroundColor: hovered ? colors.highlight : "transparent",
          marginHorizontal: -MENU_PADDING_PX,
          paddingHorizontal: MENU_PADDING_PX,
        })}
      >
        <MenuItemLabel label={t("messages.action.saveToProfile")} colors={colors} />
      </Pressable>
      <ContextMenuDivider color={colors.highlight} />
      <Pressable
        onPress={() => onSave("saved_messages")}
        style={({ pressed, hovered }) => ({
          height: MENU_ITEM_HEIGHT_PX,
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
          backgroundColor: hovered ? colors.highlight : "transparent",
          marginHorizontal: -MENU_PADDING_PX,
          paddingHorizontal: MENU_PADDING_PX,
        })}
      >
        <MenuItemLabel label={t("messages.action.saveToSavedMessages")} colors={colors} />
      </Pressable>
      <ContextMenuDivider color={colors.highlight} />
      <Pressable
        onPress={() => onSave("downloads")}
        style={({ pressed, hovered }) => ({
          height: MENU_ITEM_HEIGHT_PX,
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
          backgroundColor: hovered ? colors.highlight : "transparent",
          marginHorizontal: -MENU_PADDING_PX,
          paddingHorizontal: MENU_PADDING_PX,
        })}
      >
        <MenuItemLabel label={t("messages.action.saveToDownloads")} colors={colors} />
      </Pressable>
      <View style={{ height: SUBMENU_HINT_GAP_PX }} />
      <View
        style={{
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.highlight,
          paddingTop: SUBMENU_HINT_GAP_PX,
        }}
      >
        <Text style={hintStyle}>{t("messages.action.saveToHint")}</Text>
      </View>
    </View>
  );
}

function ContextMenuPanel({
  colors,
  canEdit,
  canDelete,
  canSaveAudio,
  saveSubmenuOpen,
  onReply,
  onEdit,
  onDelete,
  onCopyFilename,
  onToggleSaveSubmenu,
  onSaveAudio,
  onLayout,
}: {
  colors: ThemeColors;
  canEdit: boolean;
  canDelete: boolean;
  canSaveAudio: boolean;
  saveSubmenuOpen: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyFilename: () => void;
  onToggleSaveSubmenu: () => void;
  onSaveAudio: (target: MessageSaveAudioTarget) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { t } = useAppStrings();

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
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
          style={({ pressed, hovered }) => ({
            height: MENU_ITEM_HEIGHT_PX,
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
            backgroundColor: hovered ? colors.highlight : "transparent",
            marginHorizontal: -MENU_PADDING_PX,
            paddingHorizontal: MENU_PADDING_PX,
          })}
        >
          <MenuItemLabel label={t("messages.action.reply")} colors={colors} />
        </Pressable>
        {canSaveAudio ? (
          <>
            <ContextMenuDivider color={colors.highlight} />
            <Pressable
              onPress={onToggleSaveSubmenu}
              onHoverIn={Platform.OS === "web" ? onToggleSaveSubmenu : undefined}
              style={({ pressed, hovered }) => ({
                height: MENU_ITEM_HEIGHT_PX,
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
                backgroundColor:
                  saveSubmenuOpen || hovered ? colors.highlight : "transparent",
                marginHorizontal: -MENU_PADDING_PX,
                paddingHorizontal: MENU_PADDING_PX,
              })}
            >
              <MenuItemLabel
                label={t("messages.action.saveTo")}
                colors={colors}
                trailing="›"
              />
            </Pressable>
            <ContextMenuDivider color={colors.highlight} />
            <Pressable
              onPress={onCopyFilename}
              style={({ pressed, hovered }) => ({
                height: MENU_ITEM_HEIGHT_PX,
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
                backgroundColor: hovered ? colors.highlight : "transparent",
                marginHorizontal: -MENU_PADDING_PX,
                paddingHorizontal: MENU_PADDING_PX,
              })}
            >
              <MenuItemLabel label={t("messages.action.copyFilename")} colors={colors} />
            </Pressable>
          </>
        ) : null}
        {canEdit ? (
          <>
            <ContextMenuDivider color={colors.highlight} />
            <Pressable
              onPress={onEdit}
              style={({ pressed, hovered }) => ({
                height: MENU_ITEM_HEIGHT_PX,
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
                backgroundColor: hovered ? colors.highlight : "transparent",
                marginHorizontal: -MENU_PADDING_PX,
                paddingHorizontal: MENU_PADDING_PX,
              })}
            >
              <MenuItemLabel label={t("messages.action.edit")} colors={colors} />
            </Pressable>
          </>
        ) : null}
        {canDelete ? (
          <>
            <ContextMenuDivider color={colors.highlight} />
            <Pressable
              onPress={onDelete}
              style={({ pressed, hovered }) => ({
                height: MENU_ITEM_HEIGHT_PX,
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
                backgroundColor: hovered ? colors.highlight : "transparent",
                marginHorizontal: -MENU_PADDING_PX,
                paddingHorizontal: MENU_PADDING_PX,
              })}
            >
              <MenuItemLabel label={t("messages.action.delete")} colors={colors} />
            </Pressable>
          </>
        ) : null}
      </View>
      {canSaveAudio && saveSubmenuOpen ? (
        <View style={{ marginLeft: 6 }}>
          <SaveToSubmenuPanel colors={colors} onSave={onSaveAudio} />
        </View>
      ) : null}
    </View>
  );
}

function useMenuChrome(
  canEdit: boolean,
  canDelete: boolean,
  canSaveAudio: boolean,
  saveSubmenuOpen: boolean,
) {
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
    [contentSafeAreaInsetTop, safeAreaInsetTop, windowWidth, isInTelegram],
  );
  const [menuWidth, setMenuWidth] = useState(MENU_MIN_WIDTH_PX);
  const menuHeight =
    menuHeightPx(canEdit, canDelete, canSaveAudio) +
    (saveSubmenuOpen ? 0 : 0);
  // When submenu is open, reserve width for both panels when clamping.
  const clampWidth = saveSubmenuOpen
    ? menuWidth + 6 + MENU_MIN_WIDTH_PX + MENU_PADDING_PX * 2
    : menuWidth;
  const clampHeight = Math.max(
    menuHeight,
    saveSubmenuOpen ? submenuHeightPx() : menuHeight,
  );
  return { windowWidth, windowHeight, viewportInsets, menuWidth, setMenuWidth, clampWidth, clampHeight };
}

function MessageChatMessageContextMenuNative({
  visible,
  anchor,
  colors,
  canEdit,
  canDelete,
  canSaveAudio,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onCopyFilename,
  onSaveAudio,
}: Props) {
  const [saveSubmenuOpen, setSaveSubmenuOpen] = useState(false);
  useEffect(() => {
    if (!visible) setSaveSubmenuOpen(false);
  }, [visible]);
  const chrome = useMenuChrome(canEdit, canDelete, canSaveAudio, saveSubmenuOpen);
  const position =
    anchor != null
      ? clampMenuPosition(
          anchor,
          chrome.clampWidth,
          chrome.clampHeight,
          chrome.windowWidth,
          chrome.windowHeight,
          chrome.viewportInsets,
        )
      : { left: chrome.viewportInsets.left, top: chrome.viewportInsets.top };

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
            canSaveAudio={canSaveAudio}
            saveSubmenuOpen={saveSubmenuOpen}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            onCopyFilename={onCopyFilename}
            onToggleSaveSubmenu={() => setSaveSubmenuOpen(true)}
            onSaveAudio={onSaveAudio}
            onLayout={(event) => {
              const next = Math.ceil(event.nativeEvent.layout.width);
              if (next > 0) chrome.setMenuWidth(next);
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
  canSaveAudio,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onCopyFilename,
  onSaveAudio,
}: Props) {
  const [saveSubmenuOpen, setSaveSubmenuOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const chrome = useMenuChrome(canEdit, canDelete, canSaveAudio, saveSubmenuOpen);

  useEffect(() => {
    if (typeof document !== "undefined") {
      setPortalTarget(document.body);
    }
  }, []);

  useEffect(() => {
    if (!visible) setSaveSubmenuOpen(false);
  }, [visible]);

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
    chrome.clampWidth,
    chrome.clampHeight,
    chrome.windowWidth,
    chrome.windowHeight,
    chrome.viewportInsets,
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
          canSaveAudio={canSaveAudio}
          saveSubmenuOpen={saveSubmenuOpen}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onCopyFilename={onCopyFilename}
          onToggleSaveSubmenu={() => setSaveSubmenuOpen(true)}
          onSaveAudio={onSaveAudio}
          onLayout={(event) => {
            const next = Math.ceil(event.nativeEvent.layout.width);
            if (next > 0) chrome.setMenuWidth(next);
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

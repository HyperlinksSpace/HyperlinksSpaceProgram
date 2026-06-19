import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ReactNode,
} from "react-native";
import { layout, typographyRect15, useColors } from "../theme";
import { HspScrollColumn } from "./HspScrollColumn";

/** Top inset of modal sheet from the viewport (px). */
export const APP_MODAL_SHEET_TOP_INSET_PX = 60;
/** Bottom breathing room so the sheet does not touch the screen edge (px). */
export const APP_MODAL_SHEET_BOTTOM_INSET_PX = layout.contentSideInsetPx;

export const appModalSheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start",
    alignItems: "center",
    overflow: "hidden",
    ...Platform.select({
      web: { overscrollBehavior: "contain" as const },
      default: {},
    }),
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    ...Platform.select({
      web: { boxSizing: "border-box" as const },
      default: {},
    }),
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  title: {
    marginBottom: 10,
  },
  body: {
    marginBottom: 12,
    textAlign: "center",
  },
  hint: {
    marginTop: 12,
    textAlign: "center",
  },
  centerBlock: {
    alignItems: "center",
    marginBottom: 12,
  },
  error: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 8,
  },
  button: {
    minHeight: 40,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    minWidth: 100,
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    minHeight: 40,
  },
  passwordBlock: {
    marginBottom: 12,
    gap: 10,
  },
  qr: {
    width: 220,
    height: 220,
    marginBottom: 12,
    borderRadius: 8,
  },
});

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AppModalSheet({ visible, onClose, title, children, footer }: Props) {
  const colors = useColors();
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.max(
    160,
    windowHeight - APP_MODAL_SHEET_TOP_INSET_PX - APP_MODAL_SHEET_BOTTOM_INSET_PX,
  );
  const [scrollColumnHeight, setScrollColumnHeight] = useState(sheetMaxHeight);

  useEffect(() => {
    if (!visible) {
      setScrollColumnHeight(sheetMaxHeight);
    }
  }, [visible, sheetMaxHeight]);

  useEffect(() => {
    setScrollColumnHeight((current) => Math.min(current, sheetMaxHeight));
  }, [sheetMaxHeight]);

  useEffect(() => {
    if (!visible || Platform.OS !== "web" || typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[
          appModalSheetStyles.backdrop,
          {
            paddingTop: APP_MODAL_SHEET_TOP_INSET_PX,
            paddingBottom: APP_MODAL_SHEET_BOTTOM_INSET_PX,
            paddingHorizontal: layout.contentSideInsetPx,
          },
        ]}
        onPress={onClose}
      >
        <Pressable
          style={[
            appModalSheetStyles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.highlight,
              maxHeight: sheetMaxHeight,
              height: scrollColumnHeight,
            },
          ]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <HspScrollColumn
            style={{ height: scrollColumnHeight, maxHeight: sheetMaxHeight, flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={appModalSheetStyles.scrollContent}
            containOverscroll
            onMetricsChange={({ contentH }) => {
              if (contentH <= 0) return;
              const capped = Math.min(Math.max(contentH, 160), sheetMaxHeight);
              setScrollColumnHeight((prev) => (prev === capped ? prev : capped));
            }}
          >
            <Text style={[typographyRect15, appModalSheetStyles.title, { color: colors.primary }]}>
              {title}
            </Text>
            {children}
            {footer}
          </HspScrollColumn>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function AppModalSheetBackFooter({
  onClose,
  disabled,
  label,
  extraActions,
}: {
  onClose: () => void;
  disabled?: boolean;
  label: string;
  extraActions?: ReactNode;
}) {
  const colors = useColors();

  return (
    <View style={appModalSheetStyles.actions}>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={[appModalSheetStyles.button, { backgroundColor: colors.undercover }]}
        disabled={disabled}
      >
        <Text style={[typographyRect15, { color: colors.secondary }]}>{label}</Text>
      </Pressable>
      {extraActions}
    </View>
  );
}

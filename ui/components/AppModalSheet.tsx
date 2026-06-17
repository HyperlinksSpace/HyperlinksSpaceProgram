import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ReactNode,
} from "react-native";
import { layout, typographyRect15, useColors } from "../theme";

export const appModalSheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: layout.contentSideInsetPx,
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...Platform.select({
      web: { boxSizing: "border-box" as const },
      default: {},
    }),
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={appModalSheetStyles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            appModalSheetStyles.sheet,
            { backgroundColor: colors.background, borderColor: colors.highlight },
          ]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <Text style={[typographyRect15, appModalSheetStyles.title, { color: colors.primary }]}>
            {title}
          </Text>
          {children}
          {footer}
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

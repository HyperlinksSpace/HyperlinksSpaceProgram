import { type ReactNode } from "react";
import { View } from "react-native";

type Props = {
  active: boolean;
  children: ReactNode;
  /** When false, the active slot sizes to content instead of filling the parent. */
  fillActive?: boolean;
};

/**
 * Renders one authenticated-home panel at a time. Inactive slots unmount their
 * children (no `display: none` hidden trees) so compact / iOS TMA does not keep
 * feed, swap, or list fetchers alive off-screen.
 */
export function AuthenticatedHomePersistedPanelSlot({
  active,
  children,
  fillActive = true,
}: Props) {
  if (!active) {
    return null;
  }
  return (
    <View
      style={{
        ...(fillActive ? { flex: 1, minHeight: 0 } : null),
        width: "100%",
        alignSelf: "stretch",
      }}
      accessibilityElementsHidden={false}
      importantForAccessibility="auto"
    >
      {children}
    </View>
  );
}
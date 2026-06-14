import { type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

type Props = {
  active: boolean;
  children: ReactNode;
};

const hiddenStyle = { display: "none" } as ViewStyle;

/**
 * Keeps children mounted while hidden so images, scroll position, and form state
 * survive header menu / tab switches on authenticated home.
 */
export function AuthenticatedHomePersistedPanelSlot({ active, children }: Props) {
  return (
    <View
      style={
        active
          ? {
              flex: 1,
              width: "100%",
              alignSelf: "stretch",
              minHeight: 0,
            }
          : hiddenStyle
      }
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      {children}
    </View>
  );
}

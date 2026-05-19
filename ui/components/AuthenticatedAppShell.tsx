import { type ReactNode } from "react";
import { View } from "react-native";
import { CenteredLogoOnlyHeader } from "./CenteredLogoOnlyHeader";
import { layout, useColors } from "../theme";

/**
 * Narrow `/swap` chrome: centered logo header (same as `/key` / TMA logo-only strip) and padded body.
 * Wide swap renders in the home split column on `/`, not this shell.
 */
export function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  const colors = useColors();

  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        backgroundColor: colors.background,
      }}
    >
      <CenteredLogoOnlyHeader />
      <View
        style={{
          flex: 1,
          width: "100%",
          paddingHorizontal: layout.contentSideInsetPx,
          paddingBottom: layout.authenticatedHome.contentInsetBottom,
        }}
      >
        {children}
      </View>
    </View>
  );
}

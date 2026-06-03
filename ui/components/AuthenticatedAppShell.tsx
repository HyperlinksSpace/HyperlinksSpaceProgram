import { type ReactNode } from "react";
import { View } from "react-native";
import { CenteredLogoOnlyHeader } from "./CenteredLogoOnlyHeader";
import { layout, useColors } from "../theme";

/**
 * Narrow `/swap`, `/smart`, `/trade`, `/send`, `/get` chrome: centered logo header (same as `/key` / TMA logo-only strip) and padded body.
 * Wide send/get/trade/smart/swap render in the home split column on `/`, not this shell.
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
      <CenteredLogoOnlyHeader showBrowserBackButton />
      <View
        style={{
          flex: 1,
          width: "100%",
          paddingHorizontal: layout.contentSideInsetPx,
        }}
      >
        {children}
      </View>
    </View>
  );
}

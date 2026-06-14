import { type ReactNode } from "react";
import { View } from "react-native";
import { CenteredLogoOnlyHeader } from "./CenteredLogoOnlyHeader";
import { layout, useColors } from "../theme";

type Props = {
  children: ReactNode;
  /** When false, only body (+ optional belowHeader) — no centered logo strip. */
  showLogoHeader?: boolean;
  showBrowserBackButton?: boolean;
  headerRightAccessory?: ReactNode;
  /** Full-bleed row under the logo header (e.g. choose-currency subheader on narrow routes). */
  belowHeader?: ReactNode;
};

/**
 * Narrow `/swap`, `/smart`, `/trade`, `/send`, `/get` chrome: centered logo header (same as `/key` / TMA logo-only strip) and padded body.
 * Wide send/get/trade/smart/swap render in the home split column on `/`, not this shell.
 */
export function AuthenticatedAppShell({
  children,
  showLogoHeader = true,
  showBrowserBackButton = true,
  headerRightAccessory,
  belowHeader,
}: Props) {
  const colors = useColors();

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        alignSelf: "stretch",
        backgroundColor: colors.background,
      }}
    >
      {showLogoHeader ? (
        <CenteredLogoOnlyHeader
          showBrowserBackButton={showBrowserBackButton}
          rightAccessory={headerRightAccessory}
        />
      ) : null}
      {belowHeader}
      <View
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          paddingHorizontal: layout.contentSideInsetPx,
        }}
      >
        {children}
      </View>
    </View>
  );
}

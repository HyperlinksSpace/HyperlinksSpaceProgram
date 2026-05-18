import { type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { GlobalBottomBar } from "./GlobalBottomBar";
import { HomeAuthenticatedHeaderRow } from "./HomeAuthenticatedHeaderRow";
import { AuthenticatedHomeSplitBody } from "./AuthenticatedHomeSplitBody";
import { useTelegram } from "./Telegram";
import { authenticatedHomeBottomBarDock, layout, useColors } from "../theme";
import { useResolvedPathname } from "../useResolvedPathname";
import { useAppStrings } from "../../locales/AppStringsContext";

/**
 * Authenticated chrome shared by home, swap, and future split-layout routes:
 * header row, optional wide split body, bottom bar docked per breakpoint (no duplicate footer in content).
 */
export function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  const colors = useColors();
  const { t } = useAppStrings();
  const pathname = useResolvedPathname();
  const { width: windowWidth } = useWindowDimensions();
  const { wallet, displayName } = useTelegram();

  const walletAddress = wallet?.wallet_address ?? "";
  const headerDisplayName = displayName?.trim() || t("common.emDash");

  const aiBarDock = authenticatedHomeBottomBarDock(pathname, windowWidth, true);
  const embeddedAiBar = aiBarDock === "screenFooter" ? null : <GlobalBottomBar />;

  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{
          flex: 1,
          width: "100%",
          paddingTop: layout.authenticatedHome.contentInsetTop,
          paddingBottom: layout.authenticatedHome.contentInsetBottom,
        }}
      >
        <HomeAuthenticatedHeaderRow walletAddress={walletAddress} displayName={headerDisplayName} />
        <AuthenticatedHomeSplitBody
          left={
            <View style={{ width: "100%", alignSelf: "stretch", paddingHorizontal: layout.contentSideInsetPx }}>
              {children}
            </View>
          }
          right={<View style={{ flex: 1 }} />}
          middleColumnFooter={aiBarDock === "splitColumn2" ? embeddedAiBar : null}
          thirdColumnFooter={aiBarDock === "splitColumn3" ? embeddedAiBar : null}
        />
      </View>
    </View>
  );
}

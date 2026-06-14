import { Redirect, useLocalSearchParams } from "expo-router";
import { useLayoutEffect } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useAuthenticatedHomeRouteWideLayout } from "../../../ui/authenticatedHomeLayoutWidth";
import { openAuthenticatedHomeRightPanel } from "../../../ui/authenticatedHomeRightPanel";
import { ChooseCurrencyScreen } from "../../../ui/screens/ChooseCurrencyScreen";
import {
  closeSwapCurrencyPicker,
  openSwapCurrencyPicker,
  type SwapCurrencySide,
} from "../../../ui/swap/swapCurrencyPicker";

function parseSide(raw: string | string[] | undefined): SwapCurrencySide {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "sell" ? "sell" : "buy";
}

export default function SwapChooseCurrencyRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const { side: sideParam } = useLocalSearchParams<{ side?: string | string[] }>();
  const isWide = useAuthenticatedHomeRouteWideLayout();
  const side = parseSide(sideParam);

  useLayoutEffect(() => {
    openSwapCurrencyPicker(side);
    if (isWide) {
      openAuthenticatedHomeRightPanel("swap");
    }
    return () => {
      closeSwapCurrencyPicker();
    };
  }, [isWide, side]);

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }
  if (isWide) {
    return <Redirect href="/" />;
  }

  return <ChooseCurrencyScreen />;
}

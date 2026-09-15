import { useEffect, useRef } from "react";

import { useTonConnectSession } from "../ton/TonConnectProvider";
import {
  getActiveWalletPreference,
  preferTonConnectWallet,
  sameWalletAddress,
  useActiveWalletPreference,
} from "./activeWalletPreference";

/**
 * Keep TonConnect session aligned with the header wallet preference:
 * - preference built-in → disconnect restored / leftover TonConnect sessions
 * - TonConnect connects → adopt that address as the active preference
 */
export function useReconcileActiveWalletPreference(): void {
  const ton = useTonConnectSession();
  const preference = useActiveWalletPreference();
  const disconnectingRef = useRef(false);

  useEffect(() => {
    if (preference.source !== "builtin" && preference.source !== "imported") return;
    if (!ton.connected || disconnectingRef.current) return;
    disconnectingRef.current = true;
    void ton
      .disconnect()
      .catch(() => {})
      .finally(() => {
        disconnectingRef.current = false;
      });
  }, [preference.source, ton, ton.connected]);

  useEffect(() => {
    if (!ton.connected) return;
    const live = (ton.friendlyAddress || ton.address || "").trim();
    if (!live) return;
    const pref = getActiveWalletPreference();
    // User explicitly chose built-in / imported — disconnect effect owns this.
    if (pref.source === "builtin" || pref.source === "imported") return;
    if (pref.source === "tonconnect" && sameWalletAddress(pref.address, live)) return;
    preferTonConnectWallet(live);
  }, [ton.address, ton.connected, ton.friendlyAddress]);
}

import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SendGetTitleRow } from "../transfer/SendGetTitleRow";
import {
  trimWalletAddress,
  walletAddressDisplayLines,
  walletAddressHeaderSnippet,
} from "../../wallet/walletAddressFormat";
import { typographyAeroport15, typographyAeroport20, useColors } from "../../theme";

const TOP_INSET_PX = 15;
const COPIED_GAP_PX = 20;
const COPIED_HIDE_MS = 1000;
/** prev-main `CopyableDetailPage`: 30px type, 55px line height (Flutter `height: 55/30`). */
const ADDRESS_FONT_SIZE_PX = 30;
const ADDRESS_LINE_HEIGHT_PX = 55;

type Props = {
  walletAddress: string;
  displayName: string;
  /** Narrow layout only; wide split chrome already shows this in the header row. */
  showTitleRow: boolean;
};

/** Get panel body (prev-main `GetPage` / `CopyableDetailPage`). */
export function GetPanelContent({ walletAddress, displayName, showTitleRow }: Props) {
  const colors = useColors();
  const [showCopied, setShowCopied] = useState(false);
  const hideCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedAddress = useMemo(() => trimWalletAddress(walletAddress), [walletAddress]);
  const walletSnippet = useMemo(
    () => walletAddressHeaderSnippet(trimmedAddress),
    [trimmedAddress],
  );
  const addressLines = useMemo(
    () => walletAddressDisplayLines(trimmedAddress),
    [trimmedAddress],
  );

  useEffect(() => {
    return () => {
      if (hideCopiedTimerRef.current) clearTimeout(hideCopiedTimerRef.current);
    };
  }, []);

  const onCopyAddress = useCallback(async () => {
    if (!trimmedAddress) return;
    await Clipboard.setStringAsync(trimmedAddress);
    setShowCopied(true);
    if (hideCopiedTimerRef.current) clearTimeout(hideCopiedTimerRef.current);
    hideCopiedTimerRef.current = setTimeout(() => {
      setShowCopied(false);
      hideCopiedTimerRef.current = null;
    }, COPIED_HIDE_MS);
  }, [trimmedAddress]);

  const addressLineStyle = [
    typographyAeroport20,
    {
      fontSize: ADDRESS_FONT_SIZE_PX,
      lineHeight: ADDRESS_LINE_HEIGHT_PX,
      fontWeight: "500" as const,
      color: colors.primary,
      textAlign: "center" as const,
    },
  ];

  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        minHeight: 0,
        paddingTop: TOP_INSET_PX,
      }}
    >
      {showTitleRow ? (
        <SendGetTitleRow walletSnippet={walletSnippet} displayName={displayName} />
      ) : null}
      <View
        style={{
          flex: 1,
          width: "100%",
          minHeight: 0,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View style={{ alignItems: "center", maxWidth: "100%" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy address"
            disabled={!trimmedAddress}
            onPress={() => void onCopyAddress()}
            style={{ alignItems: "center" }}
          >
            {addressLines.map((line, index) => (
              <Text key={`${index}-${line}`} style={addressLineStyle}>
                {line}
              </Text>
            ))}
          </Pressable>
          <View style={{ height: COPIED_GAP_PX }} />
          <View style={{ height: 15, justifyContent: "center", alignItems: "center" }}>
            {showCopied ? (
              <Text style={[typographyAeroport15, { color: colors.primary }]}>Copied!</Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

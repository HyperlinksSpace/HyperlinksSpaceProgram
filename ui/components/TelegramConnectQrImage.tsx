import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, Text, View } from "react-native";
import QRCode from "qrcode";
import { typographyRect15, useColors } from "../theme";
import { appModalSheetStyles } from "./AppModalSheet";

type Props = {
  link: string | null;
  loadingLabel: string;
  qrAlt: string;
};

export function TelegramConnectQrImage({ link, loadingLabel, qrAlt }: Props) {
  const colors = useColors();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!link) {
      setDataUrl(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    void (async () => {
      try {
        const mod = await import("qrcode");
        const qr = (mod as { default?: typeof QRCode }).default ?? mod;
        const url = await qr.toDataURL(link, { margin: 1, width: 220, errorCorrectionLevel: "M" });
        if (!cancelled) setDataUrl(url);
      } catch {
        try {
          const url = await QRCode.toDataURL(link, { margin: 1, width: 220, errorCorrectionLevel: "M" });
          if (!cancelled) setDataUrl(url);
        } catch {
          if (!cancelled) {
            setDataUrl(null);
            setFailed(true);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [link]);

  if (!link) {
    return (
      <View style={[appModalSheetStyles.centerBlock, { minHeight: 220, justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[typographyRect15, appModalSheetStyles.hint, { color: colors.secondary }]}>
          {loadingLabel}
        </Text>
      </View>
    );
  }

  if (dataUrl) {
    if (Platform.OS === "web") {
      return (
        <img
          src={dataUrl}
          width={220}
          height={220}
          alt={qrAlt}
          style={{ borderRadius: 8, marginBottom: 4, display: "block" }}
        />
      );
    }
    return (
      <Image
        source={{ uri: dataUrl }}
        style={appModalSheetStyles.qr}
        accessibilityLabel={qrAlt}
      />
    );
  }

  if (failed) {
    return (
      <Text style={[typographyRect15, { color: colors.secondary, textAlign: "center" }]} selectable>
        {link}
      </Text>
    );
  }

  return (
    <View style={[appModalSheetStyles.centerBlock, { minHeight: 120, justifyContent: "center" }]}>
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  );
}

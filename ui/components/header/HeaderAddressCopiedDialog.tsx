import { useEffect } from "react";
import { Platform, Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, FONT_UI_SANS_SEMIBOLD, WEB_UI_SANS_STACK } from "../../fonts";
import { useColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { AppModalSheet } from "../AppModalSheet";
import { HYPERLINKS_SPACE_LOGO_GREEN } from "../HyperlinksSpaceLogo";

const AUTO_CLOSE_MS = 1400;

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Brief success sheet after copying the header wallet address. */
export function HeaderAddressCopiedDialog({ visible, onClose }: Props) {
  const colors = useColors();
  const { colorScheme } = useTelegram();
  const lightTheme = colorScheme === "light";
  const { t } = useAppStrings();
  const labelFont = Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR;
  const titleFont = Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_SEMIBOLD;
  const green = HYPERLINKS_SPACE_LOGO_GREEN;

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => onClose(), AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <AppModalSheet
      visible
      onClose={onClose}
      title={t("home.header.copiedTitle")}
      fitContentHeight
      sizeStorageKey="hsp.headerAddressCopied.size.v1"
      offsetStorageKey="hsp.headerAddressCopied.offset.v1"
    >
      <View style={{ alignItems: "center", gap: 12, paddingBottom: 4 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: lightTheme ? "rgba(0,200,80,0.14)" : "rgba(0,224,90,0.18)",
            borderWidth: 1.5,
            borderColor: green,
          }}
        >
          <Text
            style={{
              color: green,
              fontSize: 30,
              lineHeight: 34,
              fontWeight: "700",
              fontFamily: titleFont,
            }}
          >
            ✓
          </Text>
        </View>
        <Text
          style={{
            color: colors.secondary,
            fontSize: 14,
            lineHeight: 20,
            textAlign: "center",
            fontFamily: labelFont,
          }}
        >
          {t("home.header.copiedBody")}
        </Text>
      </View>
    </AppModalSheet>
  );
}

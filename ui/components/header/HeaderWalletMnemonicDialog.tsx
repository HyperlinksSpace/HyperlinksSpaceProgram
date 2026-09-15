import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_MONO_REGULAR, FONT_UI_SANS_REGULAR, WEB_UI_MONO_STACK, WEB_UI_SANS_STACK } from "../../fonts";
import { requestWalletMnemonic } from "../../ton/requestWalletMnemonic";
import { typographyRect15, useColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { AppModalSheet } from "../AppModalSheet";
import { HeaderIconCopy } from "../icons/HeaderActionIcons";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Built-in wallet recovery phrase sheet (with copy). */
export function HeaderWalletMnemonicDialog({ visible, onClose }: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const { initData } = useTelegram();
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) {
      setWords(null);
      setError(null);
      setLoading(false);
      setCopied(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setWords(null);
    void (async () => {
      const result = await requestWalletMnemonic({ initDataRaw: initData });
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(
          result.error === "no_wallet_row"
            ? t("home.header.mnemonicNoWallet")
            : t("home.header.mnemonicFailed"),
        );
        return;
      }
      setWords(result.mnemonic);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, initData, t]);

  const onCopy = useCallback(async () => {
    if (!words?.length) return;
    await Clipboard.setStringAsync(words.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, [words]);

  if (!visible) return null;

  const labelFont = Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR;
  const monoFont = Platform.OS === "web" ? WEB_UI_MONO_STACK : FONT_UI_MONO_REGULAR;

  return (
    <AppModalSheet
      visible
      onClose={onClose}
      title={t("home.header.mnemonicTitle")}
      fitContentHeight
      sizeStorageKey="hsp.headerMnemonic.size.v1"
      offsetStorageKey="hsp.headerMnemonic.offset.v1"
    >
      <View style={{ gap: 14 }}>
        <Text
          style={{
            color: colors.secondary,
            fontSize: 14,
            lineHeight: 20,
            fontFamily: labelFont,
          }}
        >
          {t("home.header.mnemonicSubtitle")}
        </Text>

        {loading ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : error ? (
          <Text style={{ color: colors.primary, fontSize: 14, fontFamily: labelFont }}>
            {error}
          </Text>
        ) : words ? (
          <>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.highlight,
                backgroundColor: colors.undercover,
                padding: 12,
              }}
            >
              {words.map((word, index) => (
                <Text
                  key={`${index}-${word}`}
                  style={{
                    width: "46%",
                    color: colors.primary,
                    fontSize: 13,
                    lineHeight: 20,
                    fontFamily: monoFont,
                  }}
                >
                  {`${index + 1}. ${word}`}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  copied ? t("home.header.mnemonicCopied") : t("home.header.mnemonicCopy")
                }
                hitSlop={8}
                onPress={() => void onCopy()}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <HeaderIconCopy
                  color={copied ? colors.primary : colors.secondary}
                  size={18}
                />
                <Text style={[typographyRect15, { color: copied ? colors.primary : colors.secondary }]}>
                  {copied ? t("home.header.mnemonicCopied") : t("home.header.mnemonicCopy")}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </AppModalSheet>
  );
}

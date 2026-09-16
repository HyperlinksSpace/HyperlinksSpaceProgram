import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useState } from "react";
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

const WHITE_NOISE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<filter id="n">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>` +
    `<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/>` +
    `</filter>` +
    `<rect width="100%" height="100%" filter="url(%23n)"/>` +
    `</svg>`,
);

const WHITE_NOISE_BG = `url("data:image/svg+xml,${WHITE_NOISE_SVG}")`;

type Props = {
  visible: boolean;
  onClose: () => void;
};

function MnemonicWordCell({
  index,
  word,
  revealed,
  onReveal,
  revealLabel,
  monoFont,
  primaryColor,
  secondaryColor,
  undercoverColor,
}: {
  index: number;
  word: string;
  revealed: boolean;
  onReveal: () => void;
  revealLabel: string;
  monoFont: string;
  primaryColor: string;
  secondaryColor: string;
  undercoverColor: string;
}) {
  const numberLabel = `${index + 1}.`;

  if (Platform.OS === "web") {
    return (
      <View
        style={{
          width: "46%",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          minHeight: 20,
        }}
      >
        <Text
          style={{
            color: secondaryColor,
            fontSize: 13,
            lineHeight: 20,
            fontFamily: monoFont,
            flexShrink: 0,
          }}
        >
          {numberLabel}
        </Text>
        {revealed
          ? React.createElement("span", {
              style: {
                color: primaryColor,
                fontSize: 13,
                lineHeight: "20px",
                fontFamily: monoFont,
                whiteSpace: "pre",
              },
            }, word)
          : React.createElement(
              "span",
              {
                role: "button",
                title: revealLabel,
                "aria-label": revealLabel,
                onClick: (e: { stopPropagation?: () => void }) => {
                  e.stopPropagation?.();
                  onReveal();
                },
                style: {
                  position: "relative",
                  display: "inline-block",
                  flex: 1,
                  minWidth: 48,
                  cursor: "pointer",
                  borderRadius: 4,
                  lineHeight: "20px",
                  fontSize: 13,
                  fontFamily: monoFont,
                  color: "transparent",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                },
              },
              React.createElement(
                "span",
                {
                  style: {
                    opacity: 0,
                    color: "transparent",
                    whiteSpace: "pre",
                    pointerEvents: "none",
                  },
                },
                word,
              ),
              React.createElement("span", {
                "aria-hidden": true,
                style: {
                  position: "absolute",
                  inset: 0,
                  borderRadius: 4,
                  zIndex: 1,
                  backgroundColor: undercoverColor || "#323232",
                  backgroundImage: WHITE_NOISE_BG,
                  backgroundSize: "40px 40px",
                  backgroundRepeat: "repeat",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
                },
              }),
            )}
      </View>
    );
  }

  return (
    <View
      style={{
        width: "46%",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 20,
      }}
    >
      <Text
        style={{
          color: secondaryColor,
          fontSize: 13,
          lineHeight: 20,
          fontFamily: monoFont,
          flexShrink: 0,
        }}
      >
        {numberLabel}
      </Text>
      {revealed ? (
        <Text
          style={{
            flex: 1,
            color: primaryColor,
            fontSize: 13,
            lineHeight: 20,
            fontFamily: monoFont,
          }}
        >
          {word}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealLabel}
          onPress={onReveal}
          style={{ flex: 1, position: "relative", minHeight: 20 }}
        >
          <Text style={{ opacity: 0, fontSize: 13, lineHeight: 20, fontFamily: monoFont }}>
            {word}
          </Text>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              borderRadius: 4,
              backgroundColor: undercoverColor,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                opacity: 0.85,
                backgroundColor: "#ffffff",
              }}
            />
          </View>
        </Pressable>
      )}
    </View>
  );
}

/** Built-in wallet recovery phrase sheet (with copy). */
export function HeaderWalletMnemonicDialog({ visible, onClose }: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const { initData } = useTelegram();
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, true>>({});

  useEffect(() => {
    if (!visible) {
      setWords(null);
      setError(null);
      setLoading(false);
      setCopied(false);
      setRevealed({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setWords(null);
    setRevealed({});
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

  const revealWord = useCallback((index: number) => {
    setRevealed((prev) => (prev[index] ? prev : { ...prev, [index]: true }));
  }, []);

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
                <MnemonicWordCell
                  key={`${index}-${word}`}
                  index={index}
                  word={word}
                  revealed={Boolean(revealed[index])}
                  onReveal={() => revealWord(index)}
                  revealLabel={t("home.header.mnemonicRevealWord")}
                  monoFont={monoFont}
                  primaryColor={colors.primary}
                  secondaryColor={colors.secondary}
                  undercoverColor={colors.undercover}
                />
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

import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import {
  FONT_UI_MONO_REGULAR,
  FONT_UI_SANS_REGULAR,
  WEB_UI_MONO_STACK,
  WEB_UI_SANS_STACK,
} from "../../fonts";
import { typographyAeroport15, typographyRect15, useColors } from "../../theme";
import { importWalletFromMnemonic } from "../../wallet/importedWalletsStore";
import {
  deriveTonAddressFromMnemonic,
  normalizeMnemonicInput,
  suggestMnemonicWords,
  validateTonMnemonic,
  type TonMnemonicWordCount,
} from "../../wallet/tonMnemonicImport";
import { AppModalSheet } from "../AppModalSheet";
import { HeaderIconCopy } from "../icons/HeaderActionIcons";

type Props = {
  visible: boolean;
  onClose: () => void;
  onImported: (address: string) => void;
};

function middleEllipsis(address: string, head = 6, tail = 6): string {
  const trimmed = address.trim();
  if (trimmed.length <= head + tail + 3) return trimmed;
  return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`;
}

/**
 * Import a TON wallet from a 12- or 24-word recovery phrase.
 * Network chip is TON-only now; structure supports adding more networks later.
 */
export function ImportWalletMnemonicDialog({ visible, onClose, onImported }: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const [wordCount, setWordCount] = useState<TonMnemonicWordCount>(24);
  const [words, setWords] = useState<string[]>(() => Array.from({ length: 24 }, () => ""));
  const [pasteDraft, setPasteDraft] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAddress, setPreviewAddress] = useState<string | null>(null);
  const [previewCopied, setPreviewCopied] = useState(false);
  const inputRefs = useRef<(TextInputType | null)[]>([]);

  const labelFont = Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR;
  const monoFont = Platform.OS === "web" ? WEB_UI_MONO_STACK : FONT_UI_MONO_REGULAR;

  useEffect(() => {
    if (!visible) return;
    setWordCount(24);
    setWords(Array.from({ length: 24 }, () => ""));
    setPasteDraft("");
    setActiveIndex(0);
    setBusy(false);
    setError(null);
    setPreviewAddress(null);
    setPreviewCopied(false);
  }, [visible]);

  const setWordCountSafe = useCallback((next: TonMnemonicWordCount) => {
    setWordCount(next);
    setWords((prev) => {
      const copy = Array.from({ length: next }, (_, i) => prev[i] ?? "");
      return copy;
    });
    setPreviewAddress(null);
    setPreviewCopied(false);
    setError(null);
  }, []);

  const filledWords = useMemo(
    () => words.slice(0, wordCount).map((w) => w.trim().toLowerCase()),
    [words, wordCount],
  );

  const allFilled = filledWords.every((w) => w.length > 0);

  useEffect(() => {
    if (!visible || !allFilled) {
      setPreviewAddress(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const validated = await validateTonMnemonic(filledWords);
      if (cancelled) return;
      if (!validated.ok) {
        setPreviewAddress(null);
        return;
      }
      try {
        const address = await deriveTonAddressFromMnemonic(filledWords);
        if (!cancelled) setPreviewAddress(address);
      } catch {
        if (!cancelled) setPreviewAddress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allFilled, filledWords, visible]);

  const applyPaste = useCallback((raw: string) => {
    setPasteDraft(raw);
    const parsed = normalizeMnemonicInput(raw);
    if (parsed.length === 12 || parsed.length === 24) {
      setWordCount(parsed.length);
      setWords(Array.from({ length: parsed.length }, (_, i) => parsed[i] ?? ""));
      setActiveIndex(Math.min(parsed.length - 1, parsed.length));
      setError(null);
    }
  }, []);

  const onChangeWord = useCallback(
    (index: number, value: string) => {
      const cleaned = value.toLowerCase().replace(/[^a-z]/g, "");
      setWords((prev) => {
        const next = [...prev];
        next[index] = cleaned;
        return next;
      });
      setError(null);
      if (cleaned.includes(" ") || value.includes(" ")) {
        applyPaste(value);
      }
    },
    [applyPaste],
  );

  const suggestions = useMemo(() => {
    const current = (words[activeIndex] ?? "").trim().toLowerCase();
    return suggestMnemonicWords(current, 5);
  }, [activeIndex, words]);

  const applySuggestion = useCallback(
    (word: string) => {
      setWords((prev) => {
        const next = [...prev];
        next[activeIndex] = word;
        return next;
      });
      const nextIndex = Math.min(activeIndex + 1, wordCount - 1);
      setActiveIndex(nextIndex);
      requestAnimationFrame(() => {
        inputRefs.current[nextIndex]?.focus?.();
      });
    },
    [activeIndex, wordCount],
  );

  const onCopyPreview = useCallback(async () => {
    if (!previewAddress) return;
    await Clipboard.setStringAsync(previewAddress);
    setPreviewCopied(true);
    setTimeout(() => setPreviewCopied(false), 1400);
  }, [previewAddress]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const validated = await validateTonMnemonic(filledWords);
      if (!validated.ok) {
        setError(
          validated.reason === "word_count"
            ? t("home.header.importMnemonicWordCountError")
            : validated.reason === "unknown_word"
              ? t("home.header.importMnemonicUnknownWord")
              : t("home.header.importMnemonicInvalid"),
        );
        setBusy(false);
        return;
      }
      const address = await deriveTonAddressFromMnemonic(filledWords);
      await importWalletFromMnemonic({
        network: "ton",
        mnemonic: filledWords,
        address,
        name: t("home.header.importedWallet"),
      });
      onImported(address);
      onClose();
    } catch {
      setError(t("home.header.importMnemonicFailed"));
    } finally {
      setBusy(false);
    }
  }, [filledWords, onClose, onImported, t]);

  if (!visible) return null;

  return (
    <AppModalSheet
      visible
      onClose={busy ? () => {} : onClose}
      title={t("home.header.importMnemonicTitle")}
      sizeStorageKey="hsp.importWalletMnemonic.size.v1"
      offsetStorageKey="hsp.importWalletMnemonic.offset.v1"
      sizeKind="modal"
      minSize={{ width: 320, height: 420 }}
      footer={
        <View style={{ marginTop: 12, gap: 10 }}>
          {error ? (
            <Text style={{ color: colors.primary, fontSize: 13, fontFamily: labelFont }}>
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy || !allFilled}
            onPress={() => void submit()}
            style={{
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.highlight,
              backgroundColor: allFilled && !busy ? colors.undercover : "transparent",
              opacity: allFilled && !busy ? 1 : 0.45,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[typographyAeroport15, { color: colors.primary }]}>
                {t("home.header.importMnemonicSubmit")}
              </Text>
            )}
          </Pressable>
        </View>
      }
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
          {t("home.header.importMnemonicSubtitle")}
        </Text>
        <Text
          style={{
            color: colors.secondary,
            fontSize: 12,
            lineHeight: 17,
            fontFamily: labelFont,
          }}
        >
          {t("home.header.addWalletRecoveryPhraseLocalOnly")}
        </Text>

        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: colors.secondary,
              fontSize: 12,
              lineHeight: 16,
              fontFamily: labelFont,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {t("home.header.addWalletNetworkLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: colors.undercover,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={[typographyAeroport15, { color: colors.primary }]}>
                {t("home.header.networkTon")}
              </Text>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.highlight,
                paddingHorizontal: 12,
                paddingVertical: 8,
                opacity: 0.55,
              }}
            >
              <Text style={[typographyAeroport15, { color: colors.secondary }]}>
                {t("home.header.networkMoreSoon")}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text
            style={{
              color: colors.secondary,
              fontSize: 12,
              lineHeight: 16,
              fontFamily: labelFont,
            }}
          >
            {t("home.header.importMnemonicPasteHint")}
          </Text>
          <TextInput
            value={pasteDraft}
            onChangeText={applyPaste}
            placeholder={t("home.header.importMnemonicPastePlaceholder")}
            placeholderTextColor={colors.secondary}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            style={{
              minHeight: 64,
              borderWidth: 1,
              borderColor: colors.highlight,
              backgroundColor: colors.undercover,
              color: colors.primary,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 13,
              lineHeight: 18,
              fontFamily: monoFont,
              textAlignVertical: "top",
            }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: colors.secondary,
              fontSize: 12,
              lineHeight: 16,
              fontFamily: labelFont,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {t("home.header.importMnemonicLengthLabel")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([24, 12] as const).map((count) => {
              const selected = wordCount === count;
              return (
                <Pressable
                  key={count}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setWordCountSafe(count)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.highlight,
                    backgroundColor: selected ? colors.undercover : "transparent",
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={[typographyAeroport15, { color: colors.primary }]}>
                    {count === 24
                      ? t("home.header.importMnemonic24")
                      : t("home.header.importMnemonic12")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text
          style={{
            color: colors.secondary,
            fontSize: 12,
            lineHeight: 16,
            fontFamily: labelFont,
          }}
        >
          {t("home.header.importMnemonicWordsHint")}
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {Array.from({ length: wordCount }, (_, index) => (
            <View
              key={index}
              style={{
                width: "48%",
                flexGrow: 1,
                flexBasis: "46%",
                borderWidth: 1,
                borderColor: activeIndex === index ? colors.primary : colors.highlight,
                backgroundColor: colors.undercover,
                paddingHorizontal: 8,
                paddingVertical: Platform.OS === "web" ? 8 : 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: colors.secondary,
                  fontSize: 11,
                  lineHeight: 14,
                  fontFamily: monoFont,
                  minWidth: 22,
                  flexShrink: 0,
                  ...(Platform.OS === "web"
                    ? ({ whiteSpace: "nowrap" } as object)
                    : null),
                }}
              >
                {`${index + 1}.`}
              </Text>
              <TextInput
                ref={(node) => {
                  inputRefs.current[index] = node;
                }}
                value={words[index] ?? ""}
                onChangeText={(v) => onChangeWord(index, v)}
                onFocus={() => setActiveIndex(index)}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType={index === wordCount - 1 ? "done" : "next"}
                onSubmitEditing={() => {
                  if (index < wordCount - 1) {
                    inputRefs.current[index + 1]?.focus?.();
                    setActiveIndex(index + 1);
                  }
                }}
                style={{
                  flex: 1,
                  color: colors.primary,
                  fontSize: 13,
                  fontFamily: monoFont,
                  padding: 0,
                  ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
                }}
              />
            </View>
          ))}
        </View>

        {suggestions.length > 0 && (words[activeIndex] ?? "").length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {suggestions.map((word) => (
              <Pressable
                key={word}
                onPress={() => applySuggestion(word)}
                style={{
                  borderWidth: 1,
                  borderColor: colors.highlight,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={[typographyRect15, { color: colors.secondary, fontSize: 13 }]}>
                  {word}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {previewAddress ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.highlight,
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 6,
            }}
          >
            <Text style={{ color: colors.secondary, fontSize: 12, fontFamily: labelFont }}>
              {t("home.header.importMnemonicPreview")}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  color: colors.primary,
                  fontSize: 13,
                  fontFamily: monoFont,
                }}
                selectable
              >
                {middleEllipsis(previewAddress, 8, 8)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  previewCopied
                    ? t("home.header.mnemonicCopied")
                    : t("home.header.importMnemonicCopyAddress")
                }
                hitSlop={8}
                onPress={() => void onCopyPreview()}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <HeaderIconCopy
                  color={previewCopied ? colors.primary : colors.secondary}
                  size={16}
                />
                <Text
                  style={[
                    typographyRect15,
                    {
                      color: previewCopied ? colors.primary : colors.secondary,
                      fontSize: 12,
                    },
                  ]}
                >
                  {previewCopied
                    ? t("home.header.mnemonicCopied")
                    : t("home.header.importMnemonicCopyAddress")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </AppModalSheet>
  );
}

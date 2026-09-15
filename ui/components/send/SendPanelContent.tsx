import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import {
  formatLocaleAmount,
  formatLocaleDllrBalance,
  formatLocaleTokenBalance,
  parseLocaleAmount,
} from "../../format/localeAmountFormat";
import {
  registerSendFormAction,
  setSendFormAddress,
  setSendFormAmount,
  setSendFormComment,
  setSendFormState,
  useSendFormState,
} from "../../send/sendFormStore";
import {
  SCROLL_INDICATOR_OVERLAY_CHROME_BORDER_INSET_PX,
  SCROLL_INDICATOR_SCROLL_EPS,
} from "../../scrollIndicatorPx";
import { HspScrollColumn, type HspScrollMetrics } from "../HspScrollColumn";
import { PanelGradientCtaBlock } from "../PanelGradientCtaBlock";
import { SendGetTitleRow } from "../transfer/SendGetTitleRow";
import { SwapSelectChevron } from "../swap/SwapFormIcons";
import { swapDllrTokenImage, swapTonTokenImage } from "../swap/swapFormAssets";
import {
  layout,
  typographyAeroport15,
  typographyAeroport20,
  useColors,
} from "../../theme";
import { SendActionRow } from "./SendActionRow";
import {
  SendTransferSuccessDialog,
  type SendTransferSuccessDetails,
} from "./SendTransferSuccessDialog";
import { useTonConnectSession } from "../../ton/TonConnectProvider";
import { useTelegram } from "../Telegram";
import { fetchTonapiAccountHoldings } from "../../ton/fetchTonapiAccountHoldings";
import { buildSendTransferTransaction } from "../../ton/buildSendTransferTransaction";
import { requestWalletSend } from "../../ton/requestWalletSend";
import { formatTonConnectErrorMessage } from "../../ton/formatTonConnectErrorMessage";
import { isTonConnectUserRejection } from "../../ton/isTonConnectUserRejection";
import {
  bumpWalletBalanceRefresh,
  scheduleWalletBalanceRefreshBurst,
} from "../../wallet/walletBalanceRefresh";
import {
  getBuiltinDllrBalanceUsd,
  subscribeBuiltinDllrBalance,
} from "../../pro/dllrBalanceStore";
import {
  isDllrToken,
  isNativeTonToken,
  SWAP_DLLR_TOKEN,
  SWAP_GRAM_TOKEN,
  swapTokenDisplaySymbol,
  type SwapPairToken,
} from "../../swap/swapPairTypes";
import {
  resolveFloatingDialogInsets,
} from "../floatingDialogChrome";
import { FloatingDialogStickyHeader } from "../FloatingDialogStickyHeader";
import { FloatingDialogBody } from "../FloatingDialogBody";
import { FloatingDialogShell } from "../FloatingDialogShell";
import { resolveFloatingDialogDefaultSize } from "../floatingDialogGeometry";
import { FloatingDialogScrollChromeProvider } from "../floatingDialogScrollChrome";
import {
  resolveActiveWalletAddress,
  useActiveWalletPreference,
} from "../../wallet/activeWalletPreference";
import { formatConnectedWalletDialogSubtitle } from "../../wallet/formatWalletDialogSubtitle";
import { walletAddressHeaderSnippet } from "../../wallet/walletAddressFormat";

const TOP_INSET_PX = 15;
const TITLE_TO_SEND_GAP_PX = 20;
const SECTION_GAP_PX = 15;
const ADDRESS_SECTION_GAP_PX = 30;
const SEND_MUTED = "#818181";
const CURRENCY_ICON_PX = 20;
const INSUFFICIENT_AMOUNT_COLOR = "#FF1111";

const amountTextStyle = [typographyAeroport20, { fontWeight: "500" as const }];
const muted15 = [typographyAeroport15, { color: SEND_MUTED }];
const label20 = typographyAeroport20;
const action15 = [typographyAeroport15, { fontWeight: "400" as const }];

type Props = {
  /** Built-in app wallet address (used when TonConnect is not the active source). */
  walletAddress: string;
};

type SendCurrencyOption = {
  token: SwapPairToken;
  balanceText: string;
  priceUsd: number | null;
};

function formatRawTokenBalance(
  balanceRaw: string,
  decimals: number,
  locale: Parameters<typeof formatLocaleTokenBalance>[1],
): string {
  try {
    const raw = BigInt(balanceRaw);
    if (raw === 0n) return "0";
    const scale = 10n ** BigInt(Math.max(0, decimals));
    const whole = raw / scale;
    const frac = raw % scale;
    if (frac === 0n) {
      return formatLocaleTokenBalance(Number(whole), locale, 0);
    }
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    if (!fracStr) return formatLocaleTokenBalance(Number(whole), locale, 0);
    const asNum = Number(`${whole}.${fracStr}`);
    if (!Number.isFinite(asNum)) return "—";
    return formatLocaleTokenBalance(asNum, locale, Math.min(7, decimals));
  } catch {
    return "—";
  }
}

/** Canonical amount string for APIs / chain (`.` decimal, no grouping). */
function toCanonicalAmount(raw: string, locale: Parameters<typeof parseLocaleAmount>[1]): string | null {
  const n = parseLocaleAmount(raw, locale);
  if (n == null || !(n > 0)) return null;
  // Avoid scientific notation for typical wallet amounts.
  return n.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 18,
  });
}

function tokenIconSource(token: SwapPairToken) {
  if (token.icon) return token.icon as never;
  if (token.imageUrl) return { uri: token.imageUrl };
  if (isDllrToken(token)) return swapDllrTokenImage;
  return swapTonTokenImage;
}

function sameToken(a: SwapPairToken, b: SwapPairToken): boolean {
  return a.address.trim().toLowerCase() === b.address.trim().toLowerCase();
}

function SendLabelActionRow({
  label,
  action,
  onActionPress,
}: {
  label: string;
  action: string;
  onActionPress?: () => void;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <Text style={[label20, { color: colors.primary }]}>{label}</Text>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onActionPress}>
        <Text style={[action15, { color: colors.primary }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

/** Send panel body — balance-based currency picker + transfer by active wallet. */
export function SendPanelContent({ walletAddress }: Props) {
  const colors = useColors();
  const { t, tf, locale } = useAppStrings();
  const { initData } = useTelegram();
  const ton = useTonConnectSession();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const showWalletTitleRow = windowWidth <= layout.authenticatedHome.firstBreakpoint;
  const showSendActionBlock = windowWidth <= layout.authenticatedHome.secondBreakpoint;
  const contentInset = layout.contentSideInsetPx;
  const scrollShellBleed = { marginHorizontal: -contentInset };
  const scrollContentPadding = {
    paddingTop: TOP_INSET_PX,
    paddingHorizontal: contentInset,
    paddingBottom: TOP_INSET_PX,
  };

  const form = useSendFormState();
  const activeWalletPreference = useActiveWalletPreference();
  const dllrBalanceUsd = useSyncExternalStore(
    subscribeBuiltinDllrBalance,
    getBuiltinDllrBalanceUsd,
    getBuiltinDllrBalanceUsd,
  );

  const builtin = walletAddress.trim();
  const sourceKind =
    activeWalletPreference.source === "builtin"
      ? "builtin"
      : ton.connected && ton.address
        ? "tonconnect"
        : activeWalletPreference.source === "tonconnect"
          ? "tonconnect"
          : "builtin";
  const sourceAddress = resolveActiveWalletAddress({
    builtinAddress: builtin,
    preference: activeWalletPreference,
    tonConnected: ton.connected,
    tonAddress: ton.friendlyAddress || ton.address,
  });

  const [needsScroll, setNeedsScroll] = useState<boolean | null>(null);
  const scrollLayoutReady = needsScroll !== null;
  const [ctaHeightPx, setCtaHeightPx] = useState(0);
  const [options, setOptions] = useState<SendCurrencyOption[]>([]);
  const [selected, setSelected] = useState<SendCurrencyOption>(() => ({
    token: SWAP_DLLR_TOKEN,
    balanceText: "0",
    priceUsd: 1,
  }));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerHeaderExtendPx, setPickerHeaderExtendPx] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [successDetails, setSuccessDetails] = useState<SendTransferSuccessDetails | null>(null);

  const pickerDefaultSize = useMemo(
    () => resolveFloatingDialogDefaultSize(windowWidth, windowHeight, "picker"),
    [windowHeight, windowWidth],
  );
  const dialogInsets = resolveFloatingDialogInsets(windowHeight);

  const onScrollMetrics = useCallback((metrics: Omit<HspScrollMetrics, "scrollY">) => {
    if (!(metrics.layoutH > 0)) return;
    const overflow = metrics.contentH > metrics.layoutH + SCROLL_INDICATOR_SCROLL_EPS;
    setNeedsScroll((prev) => {
      if (overflow) return true;
      if (prev === true) return true;
      return false;
    });
  }, []);

  const pasteIntoAddress = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setSendFormAddress(text.trim());
  }, []);

  const pasteIntoComment = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setSendFormComment(text.trim());
  }, []);

  const onCtaHeightChange = useCallback((heightPx: number) => {
    setCtaHeightPx((current) => (current === heightPx ? current : heightPx));
  }, []);

  const refreshBalances = useCallback(async () => {
    setSendFormState({ balancesLoading: true });
    try {
      if (!sourceAddress) {
        setOptions([]);
        return;
      }

      const holdings = await fetchTonapiAccountHoldings(sourceAddress);
      const next: SendCurrencyOption[] = [];

      // Built-in ledger DLLR — default send asset for the app wallet.
      if (sourceKind === "builtin") {
        next.push({
          token: SWAP_DLLR_TOKEN,
          balanceText: formatLocaleDllrBalance(dllrBalanceUsd, locale),
          priceUsd: 1,
        });
      }

      if (holdings.nativeBalance > 0) {
        next.push({
          token: SWAP_GRAM_TOKEN,
          balanceText: formatLocaleTokenBalance(holdings.nativeBalance, locale, 7),
          priceUsd: holdings.tonPriceUsd,
        });
      }

      for (const item of holdings.jettons) {
        const jetton = item.jetton;
        if (!jetton?.address) continue;
        const symbol = (jetton.symbol ?? "").trim() || "TOKEN";
        if (symbol.toUpperCase() === "DLLR") continue;
        const decimals = typeof jetton.decimals === "number" ? jetton.decimals : 9;
        const balanceText = formatRawTokenBalance(item.balance, decimals, locale);
        if (balanceText === "0" || balanceText === "—") continue;
        next.push({
          token: {
            address: jetton.address,
            symbol,
            name: (jetton.name ?? symbol).trim() || symbol,
            decimals,
            imageUrl: jetton.image ?? null,
            isNative: false,
          },
          balanceText,
          priceUsd: item.priceUsd,
        });
      }

      setOptions(next);
      setSelected((prev) => {
        const match = next.find((row) => sameToken(row.token, prev.token));
        if (match) return match;
        // Built-in wallet: prefer DLLR as the default send asset.
        if (sourceKind === "builtin") {
          const dllr = next.find((row) => isDllrToken(row.token));
          if (dllr) return dllr;
        }
        if (next[0]) return next[0];
        return {
          token: sourceKind === "builtin" ? SWAP_DLLR_TOKEN : SWAP_GRAM_TOKEN,
          balanceText: "0",
          priceUsd: sourceKind === "builtin" ? 1 : null,
        };
      });
    } catch {
      setOptions([]);
    } finally {
      setSendFormState({ balancesLoading: false });
    }
  }, [dllrBalanceUsd, locale, sourceAddress, sourceKind]);

  useEffect(() => {
    void refreshBalances();
    if (!sourceAddress) return;
    const id = setInterval(() => void refreshBalances(), 30_000);
    return () => clearInterval(id);
  }, [refreshBalances, sourceAddress]);

  useEffect(() => {
    setSendFormState({
      token: selected.token,
      balanceText: selected.balanceText,
      priceUsd: selected.priceUsd,
      sourceKind,
    });
  }, [selected, sourceKind]);

  const selectedSymbol = swapTokenDisplaySymbol(selected.token);
  const enteredAmount = useMemo(
    () => parseLocaleAmount(form.amount, locale),
    [form.amount, locale],
  );
  const availableBalance = useMemo(
    () => parseLocaleAmount(selected.balanceText, locale),
    [locale, selected.balanceText],
  );
  const insufficientBalance =
    !form.balancesLoading &&
    enteredAmount != null &&
    availableBalance != null &&
    enteredAmount > availableBalance;

  const usdEstimate =
    enteredAmount != null &&
    selected.priceUsd != null &&
    Number.isFinite(selected.priceUsd) &&
    selected.priceUsd > 0
      ? enteredAmount * selected.priceUsd
      : null;

  const usdLabel =
    usdEstimate == null
      ? "—"
      : usdEstimate < 0.01 && usdEstimate > 0
        ? `<${formatLocaleAmount(0.01, locale, { maxFractionDigits: 2, minFractionDigits: 2, trimFractionZeros: false })}$`
        : `${formatLocaleAmount(usdEstimate, locale, {
            maxFractionDigits: usdEstimate >= 10 ? 0 : 2,
            trimFractionZeros: true,
          })}$`;

  const havingLine = form.balancesLoading
    ? t("send.havingLoading")
    : tf("send.havingLine", {
        amount: selected.balanceText,
        symbol: selectedSymbol,
      });

  const onMaxPress = useCallback(() => {
    if (!selected.balanceText || selected.balanceText === "0" || selected.balanceText === "—") {
      return;
    }
    const n = parseLocaleAmount(selected.balanceText, locale);
    if (n == null) return;
    setSendFormAmount(
      n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 18 }),
    );
  }, [locale, selected.balanceText]);

  const onSend = useCallback(async () => {
    if (form.sending) return;
    const sendingDllr = isDllrToken(selected.token);
    if (sendingDllr && sourceKind !== "builtin") return;

    const toAddress = form.address.trim();
    const amountCanonical = toCanonicalAmount(form.amount, locale);
    if (!toAddress || !amountCanonical || enteredAmount == null || enteredAmount <= 0) return;
    if (insufficientBalance) return;

    setSendError(null);
    setSendFormState({ sending: true });
    scheduleWalletBalanceRefreshBurst();

    try {
      if (sourceKind === "tonconnect") {
        if (!ton.connected || !ton.address) {
          await ton.openConnectModal();
          return;
        }
        const request = await buildSendTransferTransaction({
          amount: amountCanonical,
          token: selected.token,
          fromWalletAddress: ton.address,
          toAddress,
          comment: form.comment,
        });
        await ton.sendTransaction(request);
      } else {
        if (!builtin) {
          setSendError(t("send.error.noBuiltinWallet"));
          return;
        }
        const result = await requestWalletSend({
          toAddress,
          amount: amountCanonical,
          decimals: selected.token.decimals,
          dllr: sendingDllr,
          jettonMasterAddress:
            sendingDllr || isNativeTonToken(selected.token)
              ? null
              : selected.token.address,
          comment: form.comment,
          initDataRaw: initData,
        });
        if (!result.ok) {
          const err = result.error;
          setSendError(
            err === "recipient_not_builtin_wallet"
              ? t("send.error.recipientNotBuiltin")
              : err === "insufficient_dllr"
                ? t("send.error.insufficientDllr")
                : err === "cannot_send_to_self"
                  ? t("send.error.cannotSendToSelf")
                  : err === "missing_to_address"
                    ? t("send.error.missingAddress")
                    : err === "invalid_amount" || err === "missing_amount"
                      ? t("send.error.generic")
                      : err,
          );
          return;
        }
        if (sendingDllr && result.asset === "dllr") {
          const amountUsd =
            typeof result.amountUsd === "number" && Number.isFinite(result.amountUsd)
              ? result.amountUsd
              : enteredAmount;
          const recipientBalanceUsd =
            typeof result.recipientDllrBalanceUsd === "number" &&
            Number.isFinite(result.recipientDllrBalanceUsd)
              ? result.recipientDllrBalanceUsd
              : 0;
          setSuccessDetails({
            amountUsd: amountUsd ?? 0,
            toAddress: result.toAddress || toAddress,
            recipientBalanceUsd,
            comment: form.comment.trim() || undefined,
          });
          setSendFormAmount("1");
          setSendFormComment("");
        }
      }
      bumpWalletBalanceRefresh();
      scheduleWalletBalanceRefreshBurst([3_000, 12_000, 30_000]);
      void refreshBalances();
    } catch (error) {
      if (!isTonConnectUserRejection(error)) {
        console.warn("[send-transfer] failed", error);
        setSendError(formatTonConnectErrorMessage(error) ?? t("send.error.generic"));
      }
      scheduleWalletBalanceRefreshBurst([5_000, 15_000, 35_000]);
    } finally {
      setSendFormState({ sending: false });
    }
  }, [
    builtin,
    enteredAmount,
    form.address,
    form.amount,
    form.comment,
    form.sending,
    initData,
    insufficientBalance,
    locale,
    refreshBalances,
    selected.token,
    sourceKind,
    t,
    ton,
  ]);

  useEffect(() => {
    registerSendFormAction(() => {
      void onSend();
    });
    return () => registerSendFormAction(null);
  }, [onSend]);

  const pickerSubtitle = useMemo(() => {
    if (sourceKind === "tonconnect") {
      return formatConnectedWalletDialogSubtitle(ton.walletName, ton.address, t, tf);
    }
    const snippet = walletAddressHeaderSnippet(builtin);
    return tf("send.chooseCurrencyBuiltinSubtitle", { snippet: snippet || "—" });
  }, [builtin, sourceKind, t, tf, ton.address, ton.walletName]);

  const inputStyle = [
    typographyAeroport15,
    {
      fontWeight: "500" as const,
      lineHeight: 30,
      color: colors.primary,
      width: "100%" as const,
      ...(Platform.OS === "web"
        ? ({ outlineStyle: "none" } as Record<string, string>)
        : {}),
    },
  ];

  const amountInputStyle = [
    typographyAeroport20,
    {
      fontWeight: "500" as const,
      lineHeight: 30,
      color: insufficientBalance ? INSUFFICIENT_AMOUNT_COLOR : colors.primary,
      flex: 1,
      minWidth: 0,
      padding: 0,
      margin: 0,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
    },
  ];

  return (
    <View style={{ flex: 1, width: "100%", alignSelf: "stretch", minHeight: 0 }}>
      <HspScrollColumn
        style={{ flex: 1, ...scrollShellBleed }}
        onMetricsChange={onScrollMetrics}
        scrollIndicatorExtendBottomPx={showSendActionBlock ? ctaHeightPx : 0}
        contentContainerStyle={
          scrollLayoutReady && !needsScroll
            ? {
                ...scrollContentPadding,
                flexGrow: 1,
              }
            : scrollContentPadding
        }
      >
        {showWalletTitleRow ? (
          <>
            <SendGetTitleRow />
            <View style={{ height: TITLE_TO_SEND_GAP_PX }} />
          </>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <Text style={[label20, { color: colors.primary }]}>{t("send.title")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("send.chooseCurrencyA11y")}
            onPress={() => setPickerOpen(true)}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Image
              source={tokenIconSource(selected.token)}
              style={{ width: CURRENCY_ICON_PX, height: CURRENCY_ICON_PX, borderRadius: CURRENCY_ICON_PX / 2 }}
              contentFit="contain"
            />
            <View style={{ width: 8 }} />
            <Text style={[amountTextStyle, { color: colors.primary }]}>{selectedSymbol}</Text>
            <View style={{ width: 8 }} />
            <SwapSelectChevron />
          </Pressable>
        </View>

        <View style={{ height: SECTION_GAP_PX }} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <TextInput
            value={form.amount}
            onChangeText={setSendFormAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.secondary}
            cursorColor={colors.primary}
            style={amountInputStyle}
          />
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onMaxPress}>
            <Text style={[action15, { color: colors.primary }]}>{t("send.max")}</Text>
          </Pressable>
        </View>

        <View style={{ height: SECTION_GAP_PX }} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <Text style={muted15}>{usdLabel}</Text>
          <Text style={muted15}>{havingLine}</Text>
        </View>

        {sendError ? (
          <>
            <View style={{ height: SECTION_GAP_PX }} />
            <Text style={[muted15, { color: INSUFFICIENT_AMOUNT_COLOR }]}>{sendError}</Text>
          </>
        ) : null}

        <View style={{ height: ADDRESS_SECTION_GAP_PX }} />
        <SendLabelActionRow
          label={t("send.addressLabel")}
          action={t("send.paste")}
          onActionPress={() => void pasteIntoAddress()}
        />
        <View style={{ height: SECTION_GAP_PX }} />
        <TextInput
          value={form.address}
          onChangeText={setSendFormAddress}
          placeholder={t("send.addressPlaceholder")}
          placeholderTextColor={colors.secondary}
          style={inputStyle}
          cursorColor={colors.primary}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={{ height: ADDRESS_SECTION_GAP_PX }} />
        <SendLabelActionRow
          label={t("send.commentLabel")}
          action={t("send.paste")}
          onActionPress={() => void pasteIntoComment()}
        />
        <View style={{ height: SECTION_GAP_PX }} />
        <TextInput
          value={form.comment}
          onChangeText={setSendFormComment}
          placeholder={t("send.commentPlaceholder")}
          placeholderTextColor={colors.secondary}
          style={inputStyle}
          cursorColor={colors.primary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={{ height: TOP_INSET_PX }} />
      </HspScrollColumn>
      {showSendActionBlock ? (
        <PanelGradientCtaBlock onHeightChange={onCtaHeightChange}>
          <SendActionRow density="compact" />
        </PanelGradientCtaBlock>
      ) : null}

      {pickerOpen ? (
        <FloatingDialogShell
          visible={pickerOpen}
          zIndex={10070}
          defaultSize={pickerDefaultSize}
          minSize={{ width: 300, height: 240 }}
          sizeStorageKey="hsp.sendCurrencyPicker.size.v1"
          offsetStorageKey="hsp.sendCurrencyPicker.offset.v1"
          onRequestClose={() => setPickerOpen(false)}
          testId="send-currency-picker"
        >
          <FloatingDialogScrollChromeProvider headerExtendPx={pickerHeaderExtendPx}>
            <FloatingDialogBody>
              <FloatingDialogStickyHeader
                insets={dialogInsets}
                title={t("send.chooseCurrencyTitle")}
                subtitle={pickerSubtitle}
                onClose={() => setPickerOpen(false)}
                closeLabel={t("common.close")}
                onHeightChange={setPickerHeaderExtendPx}
              />
              <HspScrollColumn
                style={{ flex: 1, minHeight: 0 }}
                scrollIndicatorOverlaySeam={false}
                containOverscroll
                scrollbarRightInsetPx={SCROLL_INDICATOR_OVERLAY_CHROME_BORDER_INSET_PX}
                indicatorColor={colors.scrollIndicator}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {options.length === 0 ? (
                  <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
                    <Text
                      style={[
                        typographyAeroport15,
                        { color: colors.secondary, lineHeight: 30 },
                      ]}
                    >
                      {sourceAddress
                        ? t("send.chooseCurrencyEmpty")
                        : t("send.chooseCurrencyNoWallet")}
                    </Text>
                  </View>
                ) : (
                  options.map((item) => {
                    const symbol = swapTokenDisplaySymbol(item.token);
                    const active = sameToken(item.token, selected.token);
                    return (
                      <Pressable
                        key={item.token.address}
                        onPress={() => {
                          setSelected(item);
                          setPickerOpen(false);
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingHorizontal: 20,
                          paddingVertical: 12,
                          backgroundColor: active ? colors.undercover : "transparent",
                        }}
                        {...(Platform.OS === "web"
                          ? ({ cursor: "pointer" } as object)
                          : null)}
                      >
                        <Image
                          source={tokenIconSource(item.token)}
                          style={{
                            width: CURRENCY_ICON_PX,
                            height: CURRENCY_ICON_PX,
                            borderRadius: CURRENCY_ICON_PX / 2,
                          }}
                          contentFit="contain"
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[typographyAeroport15, { color: colors.primary }]}
                            numberOfLines={1}
                          >
                            {symbol}
                          </Text>
                        </View>
                        <Text
                          style={[typographyAeroport15, { color: colors.secondary }]}
                          numberOfLines={1}
                        >
                          {item.balanceText}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </HspScrollColumn>
            </FloatingDialogBody>
          </FloatingDialogScrollChromeProvider>
        </FloatingDialogShell>
      ) : null}
      <SendTransferSuccessDialog
        visible={successDetails != null}
        details={successDetails}
        onClose={() => setSuccessDetails(null)}
      />
    </View>
  );
}

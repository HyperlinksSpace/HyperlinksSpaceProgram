import { useEffect, useMemo, useRef } from "react";
import { Image } from "expo-image";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { formatSwapPrice } from "../../swap/swapChartFormat";
import { formatSwapQuoteAmount } from "../../swap/formatSwapQuoteAmount";
import { navigateToSwapCurrencyPicker } from "../../swap/navigateToSwapCurrencyPicker";
import {
  rotateSwapPair,
  setSwapBuyAmount,
  setSwapSellAmount,
  useSwapPairState,
} from "../../swap/swapPairStore";
import { swapTokenDisplaySymbol } from "../../swap/swapPairTypes";
import {
  displayAmountTextProps,
  layout,
  typographyAeroport15,
  typographyAeroport20,
  useColors,
  webNonEditableTextStyle,
} from "../../theme";
import { useResolvedPathname } from "../../useResolvedPathname";
import { SmartGradientDivider } from "../smart/SmartGradientDivider";
import { SwapActionRow } from "./SwapActionRow";
import { SwapAmountInput } from "./SwapAmountInput";
import { SwapRotateIcon, SwapSelectChevron } from "./SwapFormIcons";
import { SwapSampleTokenStrip } from "./SwapSampleTokenStrip";
import { swapDllrTokenImage, swapTonTokenImage } from "./swapFormAssets";

const SWAP_MUTED = "#818181";
const SECTION_GAP_PX = 15;

const amountTextStyle = [typographyAeroport20, { fontWeight: "500" as const }];
const muted15 = [typographyAeroport15, { color: SWAP_MUTED }];

type Props = {
  effectivePriceUsd: number | null;
  /** @deprecated Use {@link effectivePriceUsd}. */
  effectiveTonPriceUsd?: number | null;
  /** When false, parent pins SwapActionRow under a bottom divider (Currencies-style). */
  showActionBlock?: boolean;
};

function tokenIconSource(token: {
  icon?: unknown;
  imageUrl?: string | null;
  symbol: string;
}) {
  if (token.icon) return token.icon as never;
  if (token.imageUrl) return { uri: token.imageUrl };
  const upper = token.symbol.trim().toUpperCase();
  if (upper === "DLLR") return swapDllrTokenImage;
  if (upper === "TON" || upper === "GRAM") return swapTonTokenImage;
  return null;
}

/**
 * Sell / max·rotate·wallet / Buy / insufficient-amount blocks below the chart (prev-main).
 */
export function SwapFormBelowChart({
  effectivePriceUsd,
  effectiveTonPriceUsd,
  showActionBlock,
}: Props) {
  const priceUsd = effectivePriceUsd ?? effectiveTonPriceUsd ?? null;
  const colors = useColors();
  const router = useRouter();
  const pathname = useResolvedPathname();
  const { width: windowWidth } = useWindowDimensions();
  const {
    sellToken,
    buyToken,
    sellAmount,
    buyAmount,
    quoteDirection,
    lastQuotedSellAmount,
    lastQuotedBuyAmount,
  } = useSwapPairState();
  const showSwapActionBlock =
    showActionBlock ?? windowWidth <= layout.authenticatedHome.secondBreakpoint;

  const openBuyCurrency = () =>
    navigateToSwapCurrencyPicker(router, "buy", windowWidth, pathname);
  const openSellCurrency = () =>
    navigateToSwapCurrencyPicker(router, "sell", windowWidth, pathname);

  const pairUsdText =
    priceUsd != null ? `${formatSwapPrice(priceUsd)}$` : "…";
  const sellPriceText = pairUsdText;
  const buyPriceText = pairUsdText;

  const sellIcon = tokenIconSource(sellToken);
  const buyIcon = tokenIconSource(buyToken);
  const sellLabel = swapTokenDisplaySymbol(sellToken).toLowerCase();
  const buyLabel = swapTokenDisplaySymbol(buyToken).toLowerCase();
  const buyNetworkLabel = swapTokenDisplaySymbol(buyToken);

  const sellEdited = quoteDirection === "exact_in";
  const buyEdited = quoteDirection === "exact_out";

  const resolvedBuyAmount = useMemo(() => {
    if (buyEdited && buyAmount.trim()) return buyAmount;
    if (!buyEdited && lastQuotedBuyAmount != null && Number.isFinite(lastQuotedBuyAmount)) {
      return formatSwapQuoteAmount(lastQuotedBuyAmount);
    }
    if (buyAmount.trim()) return buyAmount;
    return buyAmount;
  }, [buyAmount, buyEdited, lastQuotedBuyAmount]);

  const stableBuyDisplayRef = useRef("");
  const stableSellDisplayRef = useRef("");

  useEffect(() => {
    stableBuyDisplayRef.current = "";
    stableSellDisplayRef.current = "";
  }, [sellToken.address, buyToken.address]);

  if (resolvedBuyAmount.trim()) {
    stableBuyDisplayRef.current = resolvedBuyAmount;
  }
  const buyFieldValue =
    !buyEdited && !resolvedBuyAmount.trim() && stableBuyDisplayRef.current
      ? stableBuyDisplayRef.current
      : resolvedBuyAmount;

  const resolvedSellAmount = useMemo(() => {
    if (sellEdited && sellAmount.trim()) return sellAmount;
    if (!sellEdited && lastQuotedSellAmount != null && Number.isFinite(lastQuotedSellAmount)) {
      return formatSwapQuoteAmount(lastQuotedSellAmount);
    }
    if (sellAmount.trim()) return sellAmount;
    return sellAmount;
  }, [sellAmount, sellEdited, lastQuotedSellAmount]);

  if (resolvedSellAmount.trim()) {
    stableSellDisplayRef.current = resolvedSellAmount;
  }
  const sellFieldValue =
    !sellEdited && !resolvedSellAmount.trim() && stableSellDisplayRef.current
      ? stableSellDisplayRef.current
      : resolvedSellAmount;

  return (
    <View style={{ width: "100%", alignSelf: "stretch" }}>
      <View style={{ paddingTop: 20 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={[typographyAeroport20, { color: colors.primary }]}>Sell</Text>
          <SwapSampleTokenStrip onPress={openSellCurrency} />
        </View>
        <View style={{ height: 15 }} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <SwapAmountInput
            value={sellFieldValue}
            onChangeValue={setSwapSellAmount}
            placeholder="0"
            accessibilityLabel="Sell amount"
          />
          <Pressable
            accessibilityRole="button"
            onPress={openSellCurrency}
            style={{ flexDirection: "row", alignItems: "center", flexShrink: 0 }}
          >
            {sellIcon ? (
              <Image source={sellIcon} style={{ width: 20, height: 20 }} contentFit="contain" />
            ) : (
              <View style={{ width: 20, height: 20, backgroundColor: colors.secondary }} />
            )}
            <View style={{ width: 8 }} />
            <Text style={[amountTextStyle, { color: colors.primary }]}>{sellLabel}</Text>
            <View style={{ width: 8 }} />
            <SwapSelectChevron />
          </Pressable>
        </View>
        <View style={{ height: 15 }} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text {...displayAmountTextProps} style={[muted15, webNonEditableTextStyle]}>
            {sellPriceText}
          </Text>
          <Text style={muted15}>{buyNetworkLabel}</Text>
        </View>
      </View>

      <View style={{ height: 10 }} />

      <View style={{ paddingVertical: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={muted15}>max.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap sell and buy currencies"
            hitSlop={8}
            onPress={rotateSwapPair}
          >
            <SwapRotateIcon />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Text style={muted15}>Sendal Rodriges</Text>
            <View style={{ width: 5 }} />
            <Text {...displayAmountTextProps} style={[muted15, webNonEditableTextStyle]}>
              1$
            </Text>
            <View style={{ width: 5 }} />
            <SwapSelectChevron />
          </Pressable>
        </View>
      </View>

      <View style={{ paddingTop: 15, paddingBottom: 15 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={[typographyAeroport20, { color: colors.primary }]}>Buy</Text>
          <SwapSampleTokenStrip onPress={openBuyCurrency} />
        </View>
        <View style={{ height: 15 }} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <SwapAmountInput
            value={buyFieldValue}
            onChangeValue={setSwapBuyAmount}
            placeholder="0"
            accessibilityLabel="Buy amount"
          />
          <Pressable
            accessibilityRole="button"
            onPress={openBuyCurrency}
            style={{ flexDirection: "row", alignItems: "center", flexShrink: 0 }}
          >
            {buyIcon ? (
              <Image source={buyIcon} style={{ width: 20, height: 20 }} contentFit="contain" />
            ) : (
              <View style={{ width: 20, height: 20, backgroundColor: colors.secondary }} />
            )}
            <View style={{ width: 8 }} />
            <Text style={[amountTextStyle, { color: colors.primary }]}>{buyLabel}</Text>
            <View style={{ width: 8 }} />
            <SwapSelectChevron />
          </Pressable>
        </View>
        <View style={{ height: 15 }} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text {...displayAmountTextProps} style={[muted15, webNonEditableTextStyle]}>
            {buyPriceText}
          </Text>
          <Text style={muted15}>{buyNetworkLabel}</Text>
        </View>
      </View>

      {showSwapActionBlock ? (
        <>
          <View style={{ height: SECTION_GAP_PX }} />
          <SmartGradientDivider />
          <View style={{ height: SECTION_GAP_PX }} />
          <SwapActionRow />
          <View style={{ height: SECTION_GAP_PX }} />
        </>
      ) : null}
    </View>
  );
}

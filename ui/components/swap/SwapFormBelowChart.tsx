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

function swapAmountPlaceholder(
  amount: string,
  isQuoting: boolean,
  isUserEditedSide: boolean,
): string {
  if (amount.trim()) return "0";
  if (isQuoting && !isUserEditedSide) return "…";
  return "0";
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
    isQuoting,
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

  const resolvedSellAmount = (() => {
    if (sellAmount.trim()) return sellAmount;
    if (!sellEdited && lastQuotedSellAmount != null && Number.isFinite(lastQuotedSellAmount)) {
      return formatSwapQuoteAmount(lastQuotedSellAmount);
    }
    return sellAmount;
  })();

  const resolvedBuyAmount = (() => {
    if (buyAmount.trim()) return buyAmount;
    if (!buyEdited && lastQuotedBuyAmount != null && Number.isFinite(lastQuotedBuyAmount)) {
      return formatSwapQuoteAmount(lastQuotedBuyAmount);
    }
    return buyAmount;
  })();

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
            value={resolvedSellAmount}
            onChangeValue={setSwapSellAmount}
            placeholder={swapAmountPlaceholder(resolvedSellAmount, isQuoting, sellEdited)}
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
            value={resolvedBuyAmount}
            onChangeValue={setSwapBuyAmount}
            placeholder={swapAmountPlaceholder(resolvedBuyAmount, isQuoting, buyEdited)}
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

import { Image } from "expo-image";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { SWAP_BUY_AMOUNT_TON } from "../../swap/fetchSwapAmount";
import { formatSwapPrice, formatSwapTokenAmount } from "../../swap/swapChartFormat";
import { useSwapAmount } from "../../swap/useSwapAmount";
import { layout, typographyAeroport15, typographyAeroport20, useColors } from "../../theme";
import { navigateToSwapCurrencyPicker } from "../../swap/navigateToSwapCurrencyPicker";
import { useResolvedPathname } from "../../useResolvedPathname";
import { SmartGradientDivider } from "../smart/SmartGradientDivider";
import { SwapActionRow } from "./SwapActionRow";
import { SwapRotateIcon, SwapSelectChevron } from "./SwapFormIcons";
import { SwapSampleTokenStrip } from "./SwapSampleTokenStrip";
import { swapDllrTokenImage, swapTonTokenImage } from "./swapFormAssets";

const SWAP_MUTED = "#818181";
const SECTION_GAP_PX = 15;

const amountTextStyle = [typographyAeroport20, { fontWeight: "500" as const }];
const muted15 = [typographyAeroport15, { color: SWAP_MUTED }];

type Props = {
  effectiveTonPriceUsd: number | null;
};

/**
 * Buy / max·rotate·wallet / Sell / insufficient-amount blocks below the chart (prev-main).
 */
export function SwapFormBelowChart({ effectiveTonPriceUsd }: Props) {
  const colors = useColors();
  const router = useRouter();
  const pathname = useResolvedPathname();
  const { width: windowWidth } = useWindowDimensions();
  const showSwapActionBlock = windowWidth <= layout.authenticatedHome.secondBreakpoint;
  const { sellAmount, isLoading, error } = useSwapAmount();

  const openBuyCurrency = () => navigateToSwapCurrencyPicker(router, "buy", windowWidth, pathname);
  const openSellCurrency = () => navigateToSwapCurrencyPicker(router, "sell", windowWidth, pathname);

  const buyAmountText = formatSwapTokenAmount(SWAP_BUY_AMOUNT_TON);
  const buyPriceText =
    effectiveTonPriceUsd != null ? `${formatSwapPrice(effectiveTonPriceUsd)}$` : "…";

  let sellAmountText = formatSwapTokenAmount(1);
  if (isLoading) sellAmountText = "...";
  else if (error) sellAmountText = "Error";
  else if (sellAmount != null) sellAmountText = formatSwapTokenAmount(sellAmount);

  const sellPriceText =
    sellAmount != null && !isLoading && !error
      ? `${formatSwapPrice(sellAmount)}$`
      : "…";

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
          <Text style={[typographyAeroport20, { color: colors.primary }]}>Buy</Text>
          <SwapSampleTokenStrip onPress={openBuyCurrency} />
        </View>
        <View style={{ height: 15 }} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={[amountTextStyle, { color: colors.primary }]}>{buyAmountText}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={openBuyCurrency}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Image source={swapTonTokenImage} style={{ width: 20, height: 20 }} contentFit="contain" />
            <View style={{ width: 8 }} />
            <Text style={[amountTextStyle, { color: colors.primary }]}>ton</Text>
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
          <Text style={muted15}>{buyPriceText}</Text>
          <Text style={muted15}>TON</Text>
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
          <SwapRotateIcon />
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Text style={muted15}>Sendal Rodriges</Text>
            <View style={{ width: 5 }} />
            <Text style={muted15}>1$</Text>
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
          <Text style={[typographyAeroport20, { color: colors.primary }]}>Sell</Text>
          <SwapSampleTokenStrip onPress={openSellCurrency} />
        </View>
        <View style={{ height: 15 }} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={[amountTextStyle, { color: colors.primary }]}>{sellAmountText}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={openSellCurrency}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Image source={swapDllrTokenImage} style={{ width: 20, height: 20 }} contentFit="contain" />
            <View style={{ width: 8 }} />
            <Text style={[amountTextStyle, { color: colors.primary }]}>dllr</Text>
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
          <Text style={muted15}>{sellPriceText}</Text>
          <Text style={muted15}>TON</Text>
        </View>
      </View>

      {showSwapActionBlock ? (
        <>
          <View style={{ height: SECTION_GAP_PX }} />
          <SmartGradientDivider />
          <View style={{ height: SECTION_GAP_PX }} />
          <SwapActionRow dllrAmount={!isLoading && !error ? sellAmount : null} />
          <View style={{ height: SECTION_GAP_PX }} />
        </>
      ) : null}
    </View>
  );
}

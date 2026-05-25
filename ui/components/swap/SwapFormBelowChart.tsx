import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { SWAP_BUY_AMOUNT_TON } from "../../swap/fetchSwapAmount";
import { formatSwapPrice, formatSwapTokenAmount } from "../../swap/swapChartFormat";
import { useSwapAmount } from "../../swap/useSwapAmount";
import { typographyAeroport15, typographyAeroport20, typographyRect15, useColors } from "../../theme";
import { SwapRotateIcon, SwapSelectChevron } from "./SwapFormIcons";
import { SwapSampleTokenStrip } from "./SwapSampleTokenStrip";
import { swapDllrTokenImage, swapTonTokenImage } from "./swapFormAssets";

const SWAP_MUTED = "#818181";

/** Matches welcome auth row (`WelcomeAuthButtons` `BUTTON_HEIGHT`). */
const INACTIVE_CTA_HEIGHT_PX = 40;
const INACTIVE_CTA_HORIZONTAL_PADDING_PX = 20;

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
  const { sellAmount, isLoading, error } = useSwapAmount();

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
          <SwapSampleTokenStrip />
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
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Image source={swapTonTokenImage} style={{ width: 20, height: 20 }} contentFit="contain" />
            <View style={{ width: 8 }} />
            <Text style={[amountTextStyle, { color: colors.primary }]}>ton</Text>
            <View style={{ width: 8 }} />
            <SwapSelectChevron />
          </View>
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
          <SwapSampleTokenStrip />
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
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Image source={swapDllrTokenImage} style={{ width: 20, height: 20 }} contentFit="contain" />
            <View style={{ width: 8 }} />
            <Text style={[amountTextStyle, { color: colors.primary }]}>dllr</Text>
            <View style={{ width: 8 }} />
            <SwapSelectChevron />
          </View>
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

      <View
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        style={{
          marginBottom: 10,
          width: "100%",
          height: INACTIVE_CTA_HEIGHT_PX,
          paddingHorizontal: INACTIVE_CTA_HORIZONTAL_PADDING_PX,
          backgroundColor: colors.undercover,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={[typographyRect15, { color: colors.secondary, textAlign: "center" }]}>
          Insufficient amount
        </Text>
      </View>
    </View>
  );
}

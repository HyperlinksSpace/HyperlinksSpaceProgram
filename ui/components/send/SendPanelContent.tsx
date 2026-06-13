import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { HspScrollColumn, type HspScrollMetrics } from "../HspScrollColumn";
import { SmartGradientDivider } from "../smart/SmartGradientDivider";
import { SendGetTitleRow } from "../transfer/SendGetTitleRow";
import { SwapSelectChevron } from "../swap/SwapFormIcons";
import { swapDllrTokenImage } from "../swap/swapFormAssets";
import {
  layout,
  typographyAeroport15,
  typographyAeroport20,
  typographyRect15,
  useColors,
} from "../../theme";

const TOP_INSET_PX = 15;
const TITLE_TO_SEND_GAP_PX = 20;
const SECTION_GAP_PX = 15;
const ADDRESS_SECTION_GAP_PX = 30;
const SEND_MUTED = "#818181";
const ACTION_BUTTON_HEIGHT_PX = 30;
const ACTION_BUTTON_TEXT_INSET_PX = 30;
const FIT_EPSILON_PX = 1;
const { textToSendIconGapPx: TEXT_TO_BUTTON_GAP_PX } = layout.bottomBar;

const amountTextStyle = [typographyAeroport20, { fontWeight: "500" as const }];
const muted15 = [typographyAeroport15, { color: SEND_MUTED }];
const label20 = typographyAeroport20;
const action15 = [typographyAeroport15, { fontWeight: "400" as const }];

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

function SendActionRow({ address }: { address: string }) {
  const colors = useColors();
  const { t, tf } = useAppStrings();
  const shortSummaryLabel = t("send.action.summary");
  const fullSummaryLabel = address
    ? tf("send.action.summaryWithAddress", { address })
    : shortSummaryLabel;
  const [labelSlotWidth, setLabelSlotWidth] = useState(0);
  const [fullLabelWidth, setFullLabelWidth] = useState(0);

  const labelMeasured = labelSlotWidth > 0 && fullLabelWidth > 0;
  const canShowFullSummaryLabel =
    labelMeasured && fullLabelWidth <= labelSlotWidth + FIT_EPSILON_PX;
  const summaryLabel = canShowFullSummaryLabel ? fullSummaryLabel : shortSummaryLabel;

  const onLabelSlotLayout = useCallback((width: number) => {
    setLabelSlotWidth((current) => (current === width ? current : width));
  }, []);

  const onFullLabelMeasureLayout = useCallback((width: number) => {
    setFullLabelWidth((current) => (current === width ? current : width));
  }, []);

  useEffect(() => {
    setFullLabelWidth(0);
  }, [fullSummaryLabel]);

  return (
    <View style={sendActionRowStyles.wrapper}>
      <Text
        style={[typographyRect15, sendActionRowStyles.fullLabelMeasure, { color: colors.primary }]}
        onLayout={(event) => onFullLabelMeasureLayout(Math.ceil(event.nativeEvent.layout.width))}
      >
        {fullSummaryLabel}
      </Text>
      <View style={[sendActionRowStyles.row, { height: ACTION_BUTTON_HEIGHT_PX }]}>
        <View
          style={sendActionRowStyles.summaryLabelSlot}
          onLayout={(event) => onLabelSlotLayout(Math.round(event.nativeEvent.layout.width))}
        >
          <Text
            style={[typographyRect15, sendActionRowStyles.summaryLabel, { color: colors.primary }]}
            numberOfLines={1}
            accessibilityLabel={fullSummaryLabel}
          >
            {summaryLabel}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          style={[sendActionRowStyles.actionButton, { backgroundColor: colors.undercover }]}
        >
          <Text style={[typographyRect15, { color: colors.primary, textAlign: "center" }]} numberOfLines={1}>
            {t("send.action.button")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const sendActionRowStyles = StyleSheet.create({
  wrapper: {
    width: "100%",
    position: "relative",
  },
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: TEXT_TO_BUTTON_GAP_PX,
  },
  summaryLabelSlot: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  summaryLabel: {
    minWidth: 0,
  },
  fullLabelMeasure: {
    position: "absolute",
    opacity: 0,
    top: 0,
    left: 0,
    zIndex: -1,
    flexShrink: 0,
    ...Platform.select({
      web: {
        whiteSpace: "nowrap" as const,
        width: "max-content" as const,
        pointerEvents: "none" as const,
      },
      default: {},
    }),
  },
  actionButton: {
    flexShrink: 0,
    height: ACTION_BUTTON_HEIGHT_PX,
    paddingHorizontal: ACTION_BUTTON_TEXT_INSET_PX,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxSizing: "border-box" as const },
      default: {},
    }),
  },
});

/** Send panel body (prev-main `SendPage`). */
export function SendPanelContent() {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const showWalletTitleRow = windowWidth <= layout.authenticatedHome.firstBreakpoint;
  const showSendActionBlock = windowWidth <= layout.authenticatedHome.secondBreakpoint;
  const contentInset = layout.contentSideInsetPx;
  const scrollShellBleed = { marginHorizontal: -contentInset };
  const scrollContentPadding = {
    paddingTop: TOP_INSET_PX,
    paddingHorizontal: contentInset,
    paddingBottom: TOP_INSET_PX,
  };

  const [viewportH, setViewportH] = useState(0);
  const [needsScroll, setNeedsScroll] = useState<boolean | null>(null);
  const scrollLayoutReady = needsScroll !== null;
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const trimmedAddress = address.trim();

  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    setViewportH(e.nativeEvent.layout.height);
  }, []);

  const onScrollMetrics = useCallback(
    (metrics: HspScrollMetrics) => {
      if (needsScroll !== null) return;
      const overflow = metrics.layoutH > 0 && metrics.contentH > metrics.layoutH + 0.5;
      setNeedsScroll(overflow);
    },
    [needsScroll],
  );

  const pasteIntoAddress = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setAddress(text.trim());
  }, []);

  const pasteIntoComment = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setComment(text.trim());
  }, []);

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

  return (
    <View
      style={{ flex: 1, width: "100%", alignSelf: "stretch", minHeight: 0 }}
      onLayout={onViewportLayout}
    >
      <HspScrollColumn
        style={{ flex: 1, ...scrollShellBleed }}
        onMetricsChange={onScrollMetrics}
        contentContainerStyle={
          scrollLayoutReady && !needsScroll
            ? {
                ...scrollContentPadding,
                flexGrow: 1,
                ...(viewportH > 0 ? { minHeight: viewportH } : {}),
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
          <Text style={[label20, { color: colors.primary }]}>Send</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Image source={swapDllrTokenImage} style={{ width: 20, height: 20 }} contentFit="contain" />
            <View style={{ width: 8 }} />
            <Text style={[amountTextStyle, { color: colors.primary }]}>dllr</Text>
            <View style={{ width: 8 }} />
            <SwapSelectChevron />
          </View>
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
          <Text style={[amountTextStyle, { color: colors.primary }]}>1</Text>
          <Text style={[action15, { color: colors.primary }]}>max.</Text>
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
          <Text style={muted15}>1$</Text>
          <Text style={muted15}>having 1 dllr on ton</Text>
        </View>

        <View style={{ height: ADDRESS_SECTION_GAP_PX }} />
        <SendLabelActionRow label="Address" action="paste." onActionPress={() => void pasteIntoAddress()} />
        <View style={{ height: SECTION_GAP_PX }} />
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Enter address"
          placeholderTextColor={colors.secondary}
          style={inputStyle}
          cursorColor={colors.primary}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={{ height: ADDRESS_SECTION_GAP_PX }} />
        <SendLabelActionRow
          label="Comment / Memo"
          action="paste."
          onActionPress={() => void pasteIntoComment()}
        />
        <View style={{ height: SECTION_GAP_PX }} />
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Enter comment / memo"
          placeholderTextColor={colors.secondary}
          style={inputStyle}
          cursorColor={colors.primary}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {showSendActionBlock ? (
          <>
            <View style={{ height: SECTION_GAP_PX }} />
            <SmartGradientDivider />
            <View style={{ height: SECTION_GAP_PX }} />
            <SendActionRow address={trimmedAddress} />
          </>
        ) : null}
        <View style={{ height: TOP_INSET_PX }} />
      </HspScrollColumn>
    </View>
  );
}

import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  authenticatedHomeWideMenuColumnWidthPx,
  homeHeaderProfileNameText,
  homeWideMenuItemLabel,
  homeWalletAddressHeaderText,
  homeWalletBalanceHeaderText,
  layout,
  menuIconStrokeColor,
  useColors,
} from "../theme";
import {
  MenuDealsIcon,
  MenuGetIcon,
  MenuSendIcon,
  MenuSwapIcon,
  MenuTradeIcon,
} from "./menu/MenuIcons";

const AH = layout.authenticatedHome;

/** Header pressables use `AH.headerPressableHitSlop` — invisible touch padding around small targets. */
/** Header actions — `assets/header/*.svg` (fixed palette in asset; optional tint later). */
const HEADER_ICONS: readonly { source: number; accessibilityLabel: string }[] = [
  { source: require("../../assets/header/copy.svg"), accessibilityLabel: "Copy wallet address" },
  { source: require("../../assets/header/edit.svg"), accessibilityLabel: "Edit" },
  { source: require("../../assets/header/key.svg"), accessibilityLabel: "Key" },
  { source: require("../../assets/header/ru.svg"), accessibilityLabel: "Language" },
  { source: require("../../assets/header/exit.svg"), accessibilityLabel: "Exit" },
];

/** Shown in header as `walletAddressSnippetPrefix` + last N chars (lowercase); clipboard keeps original casing. */
function walletAddressHeaderSnippet(trimmed: string): string {
  if (trimmed.length === 0) return AH.walletAddressSnippetPlaceholder;
  const tail = trimmed.slice(-AH.walletAddressSnippetTailLength).toLowerCase();
  return `${AH.walletAddressSnippetPrefix}${tail}`;
}

/** Chevron from `assets/header/right.svg`; fill uses theme `highlight`. */
function HeaderProfileChevronIcon({ color }: { color: string }) {
  return (
    <Svg
      width={AH.headerProfileChevronWidth}
      height={AH.headerProfileChevronHeight}
      viewBox={AH.headerProfileChevronViewBox}
      fill="none"
    >
      <Path
        d="M1.79003 7.58886C2.98576 6.27528 2.98578 4.38625 1.79006 3.07266L0.205486 1.3319C-0.0684974 1.03091 -0.0684952 0.598063 0.205492 0.297075C0.569221 -0.102499 1.24895 -0.102496 1.61268 0.297078L4.07529 3.00239C5.30824 4.35685 5.30823 6.30469 4.07527 7.65914L1.61268 10.3644C1.24895 10.764 0.569223 10.764 0.205495 10.3644C-0.0684934 10.0634 -0.0684931 9.63054 0.205496 9.32955L1.79003 7.58886Z"
        fill={color}
      />
    </Svg>
  );
}

const WIDE_MENU_ITEMS = [
  { key: "get", label: "Get", Icon: MenuGetIcon },
  { key: "swap", label: "Swap", Icon: MenuSwapIcon },
  { key: "deals", label: "Deals", Icon: MenuDealsIcon },
  { key: "trade", label: "Trade", Icon: MenuTradeIcon },
  { key: "send", label: "Send", Icon: MenuSendIcon },
] as const;

type Props = {
  /** Raw wallet address; clipboard receives trimmed original casing. */
  walletAddress: string;
};

/**
 * Top row on authenticated home: truncated address (highlight) + header icons, space-between cluster.
 * Above `firstBreakpoint`, adds a middle column of inline-SVG actions (Get/Swap/…).
 */
export function HomeAuthenticatedHeaderRow({ walletAddress }: Props) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const trimmed = walletAddress.replace(/\s+/g, "").trim();
  const displaySnippet = walletAddressHeaderSnippet(trimmed);

  const copyFullWalletAddress = useCallback(async () => {
    if (!trimmed) return;
    await Clipboard.setStringAsync(trimmed);
  }, [trimmed]);

  const wideMenuColumnWidth = authenticatedHomeWideMenuColumnWidthPx(windowWidth);

  /** Total strip width scales with viewport via {@link authenticatedHomeWideMenuColumnWidthPx}. */
  const wideMenuStripWidth = windowWidth > AH.firstBreakpoint ? wideMenuColumnWidth * WIDE_MENU_ITEMS.length : 0;

  const wideMenuStrip = windowWidth > AH.firstBreakpoint ? (
    <View
      pointerEvents="box-none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          justifyContent: "center",
          alignItems: "center",
          zIndex: AH.wideMenuOverlayZIndex,
        },
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          width: wideMenuStripWidth,
        }}
      >
        {WIDE_MENU_ITEMS.map(({ key, label, Icon }) => (
          <View
            key={key}
            style={{
              width: wideMenuColumnWidth,
              alignItems: "center",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={label}
              hitSlop={AH.headerPressableHitSlop}
              onPress={() => {
                /* Wired when flows land */
              }}
            >
              {({ pressed }) => {
                const variant = pressed ? "highlight" : "primary";
                const labelColor =
                  variant === "highlight"
                    ? menuIconStrokeColor(colors, "highlight")
                    : menuIconStrokeColor(colors, "primary");
                return (
                  <View style={{ alignItems: "center" }}>
                    <Icon
                      variant={variant}
                      width={AH.headerIconDisplaySize}
                      height={AH.headerIconDisplaySize}
                    />
                    <Text
                      style={[
                        homeWideMenuItemLabel,
                        {
                          marginTop: AH.wideMenuIconLabelGap,
                          color: labelColor,
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                );
              }}
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  ) : null;

  return (
    /* Outer shell: full width; marginBottom = gap under header+divider before body (see theme `headerRowMarginBottom`). */
    <View style={{ width: "100%", marginBottom: AH.headerRowMarginBottom }}>
      <View style={{ width: "100%", paddingHorizontal: AH.contentInsetHorizontal }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: windowWidth > AH.firstBreakpoint ? "stretch" : "flex-start",
            width: "100%",
            ...(windowWidth > AH.firstBreakpoint ? { position: "relative" as const } : {}),
          }}
        >
      <View
        style={
          windowWidth > AH.firstBreakpoint
            ? {
                flex: 1,
                minWidth: 0,
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "flex-start",
              }
            : {
                flex: 1,
                minWidth: 0,
                alignItems: "flex-start",
                justifyContent: "center",
                marginRight: AH.addressRowGap,
              }
        }
      >
        <View
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            ...(windowWidth > AH.firstBreakpoint ? {} : { flex: 1, alignSelf: "stretch", minWidth: 0 }),
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Wallet address ${displaySnippet}`}
            accessibilityHint="Copies the full wallet address"
            disabled={!trimmed}
            hitSlop={AH.headerPressableHitSlop}
            onPress={() => {
              void copyFullWalletAddress();
            }}
            style={windowWidth > AH.firstBreakpoint ? undefined : { alignSelf: "stretch" }}
          >
            <Text style={[homeWalletAddressHeaderText, { color: colors.highlight }]}>
              {displaySnippet}
            </Text>
          </Pressable>
          <Text
            style={[
              homeWalletBalanceHeaderText,
              {
                marginTop: AH.walletBalanceBelowAddressGap,
                color: colors.primary,
              },
            ]}
            accessibilityLabel="Balance"
          >
            1$
          </Text>
        </View>
      </View>
      {wideMenuStrip}
      <View
        style={{
          flexDirection: "column",
          alignItems: "flex-end",
          ...(windowWidth > AH.firstBreakpoint
            ? { flex: 1, minWidth: 0 }
            : { flexShrink: 0, marginLeft: ("auto" as const) }),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: AH.headerIconGap,
            justifyContent: "flex-end",
          }}
        >
          {HEADER_ICONS.map(({ source, accessibilityLabel }, index) => (
            <Pressable
              key={accessibilityLabel}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              hitSlop={AH.headerPressableHitSlop}
              onPress={() => {
                if (index === 0) {
                  void copyFullWalletAddress();
                  return;
                }
                /* Wired when flows land */
              }}
            >
              <Image
                source={source}
                style={{
                  width: AH.headerIconDisplaySize,
                  height: AH.headerIconDisplaySize,
                }}
                contentFit="contain"
              />
            </Pressable>
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            justifyContent: "flex-end",
            marginTop: AH.walletBalanceBelowAddressGap,
          }}
        >
          <View style={{ justifyContent: "center" }}>
            <Text
              style={[homeHeaderProfileNameText, { color: colors.primary }]}
              accessibilityLabel="Sendal Rodriges"
            >
              Sendal Rodriges
            </Text>
          </View>
          <View
            style={{
              marginLeft: AH.headerProfileChevronAfterNameGap,
              justifyContent: "center",
            }}
          >
            <HeaderProfileChevronIcon color={colors.highlight} />
          </View>
        </View>
        </View>
      </View>
      </View>
      {windowWidth > AH.firstBreakpoint ? (
        <View
          pointerEvents="none"
          style={{
            marginTop: AH.headerDividerTopGap,
            height: AH.headerDividerHeight,
            width: "100%",
            backgroundColor: colors.highlight,
            flexShrink: 0,
          }}
        />
      ) : null}
    </View>
  );
}

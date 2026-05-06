import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  type ThemeColors,
  useColors,
} from "../theme";
import {
  MenuDealsIcon,
  MenuGetIcon,
  MenuSendIcon,
  MenuSwapIcon,
  MenuTradeIcon,
} from "./menu/MenuIcons";
import { logPageDisplay } from "../pageDisplayLog";
import {
  HeaderIconCopy,
  HeaderIconEdit,
  HeaderIconExit,
  HeaderIconKey,
  HeaderIconRu,
} from "./icons/HeaderActionIcons";

const AH = layout.authenticatedHome;

/** Header pressables use `AH.headerPressableHitSlop` — invisible touch padding around small targets. */
const HEADER_ICONS: readonly {
  accessibilityLabel: string;
  Icon: (p: { color: string; size: number }) => ReactNode;
}[] = [
  { Icon: HeaderIconCopy, accessibilityLabel: "Copy wallet address" },
  { Icon: HeaderIconEdit, accessibilityLabel: "Edit" },
  { Icon: HeaderIconKey, accessibilityLabel: "Key" },
  { Icon: HeaderIconRu, accessibilityLabel: "Language" },
  { Icon: HeaderIconExit, accessibilityLabel: "Exit" },
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

/** Get/Swap/… row: wide = fixed `columnWidth` per item; narrow = equal `flex` columns (under profile). */
function AuthenticatedHomeMenuItems({
  colors,
  narrow,
  columnWidth,
}: {
  colors: ThemeColors;
  narrow: boolean;
  /** Used when `narrow` is false (centered strip). */
  columnWidth: number;
}) {
  return WIDE_MENU_ITEMS.map(({ key, label, Icon }) => (
    <View
      key={key}
      style={
        narrow
          ? { flex: 1, minWidth: 0, alignItems: "center" as const }
          : { width: columnWidth, alignItems: "center" as const }
      }
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
  ));
}

type Props = {
  /** Raw wallet address; clipboard receives trimmed original casing. */
  walletAddress: string;
};

/**
 * Top row on authenticated home: truncated address (highlight) + header icons, space-between cluster.
 * Breakpoint uses the header shell width from `onLayout` (not only `useWindowDimensions`) so web layout matches the real column width.
 * At `firstBreakpoint` and above: centered Get/Swap/… strip overlay (painted after side columns so it is not covered on web); below: same strip under balance + profile.
 */
export function HomeAuthenticatedHeaderRow({ walletAddress }: Props) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  /** Measured shell width — matches the header column, not always the browser window (`useWindowDimensions` can stay wide on web). */
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const widthForLayout = measuredWidth ?? windowWidth;
  const atOrAboveFirstBreakpoint = widthForLayout > AH.firstBreakpoint;
  const trimmed = walletAddress.replace(/\s+/g, "").trim();
  const displaySnippet = walletAddressHeaderSnippet(trimmed);

  const copyFullWalletAddress = useCallback(async () => {
    if (!trimmed) return;
    await Clipboard.setStringAsync(trimmed);
  }, [trimmed]);

  const wideMenuColumnWidth = authenticatedHomeWideMenuColumnWidthPx(widthForLayout);

  /** Total strip width scales with viewport via {@link authenticatedHomeWideMenuColumnWidthPx}. */
  const wideMenuStripWidth = atOrAboveFirstBreakpoint
    ? wideMenuColumnWidth * WIDE_MENU_ITEMS.length
    : 0;

  const wideMenuStrip = atOrAboveFirstBreakpoint ? (
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
        <AuthenticatedHomeMenuItems
          colors={colors}
          narrow={false}
          columnWidth={wideMenuColumnWidth}
        />
      </View>
    </View>
  ) : null;

  useEffect(() => {
    logPageDisplay("home_authenticated_header_layout", {
      windowWidth,
      measuredWidth,
      widthForLayout,
      firstBreakpointPx: AH.firstBreakpoint,
      atOrAboveFirstBreakpoint,
      menuVariant: atOrAboveFirstBreakpoint ? "wide_overlay" : "narrow_below_profile",
      wideMenuColumnWidth,
      wideMenuStripWidth,
      usingMeasuredWidth: measuredWidth != null,
    });
  }, [
    windowWidth,
    measuredWidth,
    widthForLayout,
    atOrAboveFirstBreakpoint,
    wideMenuColumnWidth,
    wideMenuStripWidth,
  ]);

  return (
    /* Outer shell: full width; marginBottom = gap under header+divider before body (see theme `headerRowMarginBottom`). */
    <View
      style={{ width: "100%", marginBottom: AH.headerRowMarginBottom }}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        setMeasuredWidth((prev) => {
          if (prev === w) return prev;
          logPageDisplay("home_authenticated_header_onlayout", {
            shellWidth: w,
            windowWidth,
            firstBreakpointPx: AH.firstBreakpoint,
          });
          return w;
        });
      }}
    >
      <View style={{ width: "100%", paddingHorizontal: layout.contentSideInsetPx }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: atOrAboveFirstBreakpoint ? "stretch" : "flex-start",
            width: "100%",
            ...(atOrAboveFirstBreakpoint ? { position: "relative" as const } : {}),
          }}
        >
      <View
        style={
          atOrAboveFirstBreakpoint
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
            ...(atOrAboveFirstBreakpoint ? {} : { flex: 1, alignSelf: "stretch", minWidth: 0 }),
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
            style={atOrAboveFirstBreakpoint ? undefined : { alignSelf: "stretch" }}
          >
            <Text style={[homeWalletAddressHeaderText, { color: colors.secondary }]}>
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
      <View
        style={{
          flexDirection: "column",
          alignItems: "flex-end",
          ...(atOrAboveFirstBreakpoint
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
            ...(atOrAboveFirstBreakpoint
              ? ({ position: "relative" as const, zIndex: 2 } as const)
              : {}),
          }}
        >
          {HEADER_ICONS.map(({ Icon, accessibilityLabel }, index) => (
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
              <Icon
                color={menuIconStrokeColor(colors, "highlight")}
                size={AH.headerIconDisplaySize}
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
            <HeaderProfileChevronIcon color={menuIconStrokeColor(colors, "highlight")} />
          </View>
        </View>
      </View>
      {wideMenuStrip}
      </View>
      {!atOrAboveFirstBreakpoint ? (
        <View style={{ marginTop: AH.headerDividerTopGap, width: "100%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
            <AuthenticatedHomeMenuItems colors={colors} narrow columnWidth={0} />
          </View>
        </View>
      ) : null}
      </View>
      {atOrAboveFirstBreakpoint ? (
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

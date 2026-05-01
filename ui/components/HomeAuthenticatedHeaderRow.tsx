import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useCallback } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import {
  homeWideMenuItemLabel,
  homeWalletAddressHeaderText,
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

/** Header actions — `assets/header/*.svg` (fixed palette in asset; optional tint later). */
const HEADER_ICONS: readonly { source: number; accessibilityLabel: string }[] = [
  { source: require("../../assets/header/copy.svg"), accessibilityLabel: "Copy wallet address" },
  { source: require("../../assets/header/edit.svg"), accessibilityLabel: "Edit" },
  { source: require("../../assets/header/key.svg"), accessibilityLabel: "Key" },
  { source: require("../../assets/header/ru.svg"), accessibilityLabel: "Language" },
  { source: require("../../assets/header/exit.svg"), accessibilityLabel: "Exit" },
];

/** Shown in header as `..` + last 8 chars (lowercase); clipboard keeps original casing. */
function walletAddressHeaderSnippet(trimmed: string): string {
  if (trimmed.length === 0) return "…";
  return `..${trimmed.slice(-8).toLowerCase()}`;
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
 * Above `wideMenuBreakpoint`, adds a middle column of inline-SVG actions (Get/Swap/…).
 */
export function HomeAuthenticatedHeaderRow({ walletAddress }: Props) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const showWideMenu = windowWidth > AH.wideMenuBreakpoint;
  const wideMenuStripWidth = showWideMenu
    ? Math.min(
        AH.wideMenuItemMaxWidth * WIDE_MENU_ITEMS.length,
        Math.max(
          AH.wideMenuItemMinWidth * WIDE_MENU_ITEMS.length,
          windowWidth - 220,
        ),
      )
    : 0;
  const trimmed = walletAddress.replace(/\s+/g, "").trim();
  const displaySnippet = walletAddressHeaderSnippet(trimmed);

  const copyFullWalletAddress = useCallback(async () => {
    if (!trimmed) return;
    await Clipboard.setStringAsync(trimmed);
  }, [trimmed]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        marginBottom: 12,
      }}
    >
      <View
        style={{
          flex: 1,
          minWidth: 0,
          alignItems: "flex-start",
          justifyContent: "center",
          marginRight: showWideMenu ? 0 : AH.addressRowGap,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Wallet address ${displaySnippet}`}
          accessibilityHint="Copies the full wallet address"
          disabled={!trimmed}
          hitSlop={8}
          onPress={() => {
            void copyFullWalletAddress();
          }}
          style={
            showWideMenu
              ? { justifyContent: "center" }
              : { flex: 1, alignSelf: "stretch", minWidth: 0, justifyContent: "center" }
          }
        >
          <Text style={[homeWalletAddressHeaderText, { color: colors.highlight }]}>
            {displaySnippet}
          </Text>
        </Pressable>
      </View>
      {showWideMenu ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "row",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "center",
              width: wideMenuStripWidth,
            }}
          >
            {WIDE_MENU_ITEMS.map(({ key, label, Icon }) => (
              <View
                key={key}
                style={{
                  flex: 1,
                  minWidth: AH.wideMenuItemMinWidth,
                  maxWidth: AH.wideMenuItemMaxWidth,
                  alignItems: "center",
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  hitSlop={8}
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
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexShrink: 0,
          flexGrow: showWideMenu ? 1 : undefined,
          flexBasis: showWideMenu ? 0 : undefined,
          minWidth: 0,
          gap: AH.headerIconGap,
          justifyContent: "flex-end",
          marginLeft: showWideMenu ? 0 : ("auto" as const),
        }}
      >
        {HEADER_ICONS.map(({ source, accessibilityLabel }, index) => (
          <Pressable
            key={accessibilityLabel}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            hitSlop={8}
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
    </View>
  );
}

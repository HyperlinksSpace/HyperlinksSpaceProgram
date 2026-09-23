import * as Clipboard from "expo-clipboard";
import { usePathname, useRouter } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View, Platform, type LayoutRectangle } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  authenticatedHomeWideMenuColumnWidthPx,
  homeWideMenuItemLabel,
  displayAmountTextProps,
  homeHeaderProfileNameText,
  homeWalletAddressHeaderText,
  homeWalletBalanceHeaderText,
  layout,
  menuIconStrokeColor,
  type ThemeColors,
  uiIconButtonVerticalCompensationTransform,
  useColors,
} from "../theme";
import { readAuthenticatedHomeLayoutWidthPx } from "../authenticatedHomeLayoutWidth";
import {
  MenuSmartIcon,
  MenuGetIcon,
  MenuSendIcon,
  MenuSwapIcon,
  MenuTradeIcon,
} from "./menu/MenuIcons";
import { logPageDisplay } from "../pageDisplayLog";
import { useTelegram } from "./Telegram";
import { useAppStrings } from "../../locales/AppStringsContext";
import type { AppStringKey } from "../../locales/appStrings";
import { openAuthenticatedHomeRightPanel } from "../authenticatedHomeRightPanel";
import { openSwapCurrenciesBrowse } from "../swap/swapCurrencyPicker";
import { focusAuthenticatedHomeMiddleColumnOnHeaderPanel } from "../authenticatedHomeSelectedChat";
import { TonviewerExplorerButton } from "./TonviewerExplorerButton";
import { SwitchWalletMenu } from "./wallet/SwitchWalletMenu";
import { UndercoverProButton, UndercoverWalletButton } from "./swap/SwapFormIcons";
import { ProAccessDialog } from "../pro/ProAccessDialog";
import { subscribeOpenProAccess } from "../pro/openProAccess";
import { isProAccessActive, subscribeProAccess } from "../pro/proAccessStore";
import {
  fitHeaderAddressTailLength,
  trimWalletAddress,
  WALLET_ADDRESS_HEADER_TAIL_MIN_LENGTH,
  walletAddressHeaderSnippet,
} from "../wallet/walletAddressFormat";
import {
  fitHeaderActionIconSize,
  fitHeaderAmountFontSize,
  HEADER_ACTION_ICON_COUNT,
  HEADER_ACTION_ICON_GAP_MAX_PX,
  HEADER_ACTION_ICON_MAX_PX,
  HEADER_ACTION_ICON_MIN_PX,
  HEADER_ACTION_MENU_CLEARANCE_PX,
  HEADER_AMOUNT_FONT_MAX_PX,
  HEADER_IDENTITY_OVERFLOW_COLLAPSE_SLACK_PX,
  HEADER_IDENTITY_ROW_SAFE_GAP_PX,
  pickHeaderDisplayName,
  shouldUseHeaderIdentityOverflow,
} from "../wallet/headerRowFit";
import {
  resolveActiveWalletAddress,
  useActiveWalletPreference,
} from "../wallet/activeWalletPreference";
import { useReconcileActiveWalletPreference } from "../wallet/useReconcileActiveWalletPreference";
import {
  readImportedWallets,
  subscribeImportedWallets,
} from "../wallet/importedWalletsStore";
import { useAllWalletsHeaderBalanceLabel } from "../wallet/useWalletUsdBalanceByAddress";
import { useTonConnectSession } from "../ton/TonConnectProvider";
import { HeaderAddressCopiedDialog } from "./header/HeaderAddressCopiedDialog";
import { HeaderRenameDisplayNameDialog } from "./header/HeaderRenameDisplayNameDialog";
import { HeaderWalletIdentityMenu } from "./header/HeaderWalletIdentityMenu";
import { HeaderWalletMnemonicDialog } from "./header/HeaderWalletMnemonicDialog";
import {
  HeaderIconCopy,
  HeaderIconEdit,
  HeaderIconEn,
  HeaderIconExit,
  HeaderIconKey,
  HeaderIconMoreSquares,
  HeaderIconRu,
  HeaderIconZh,
} from "./icons/HeaderActionIcons";
import { getLastAuthSessionPayload, rememberAuthSessionPayload } from "../../auth/lastAuthSessionCache";

const AH = layout.authenticatedHome;
const HEADER_CONTROL_ROW_PX = layout.bottomBar.undercoverButtonHeightPx;
/**
 * Wallet is a circle; balance digits have left sidebearing. Same CSS gap as PRO↔wallet
 * reads larger here — pull the label toward the wallet to optically match.
 */
const WALLET_TO_BALANCE_OPTICAL_PULL_PX = 10;
/**
 * Cancel global Text `uiTextVerticalCompensationY` (−1) in the 30px header band so
 * digits / mono sit on the same centerline as undercover chips (wallet, more).
 */
const HEADER_BAND_TEXT_ALIGN_TRANSFORM = { transform: [{ translateY: 0 }] };
/** Tonviewer chip diameter in the identity cluster. */
const HEADER_EXPLORER_PX = 20;
const HEADER_IDENTITY_GAP_PX = 8;

/** One header band with optional reserved center (wide Get/Swap overlay). */
function HeaderBandSlots({
  centerReservePx,
  leftGrows,
  left,
  right,
  onLeftWidth,
  onRightWidth,
}: {
  centerReservePx: number;
  /** Compact: left (amount) keeps intrinsic width so digits are not squeezed. */
  leftGrows: boolean;
  left: ReactNode;
  right: ReactNode;
  onLeftWidth?: (widthPx: number) => void;
  onRightWidth?: (widthPx: number) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: WIDE_HEADER_BAND_PX,
        width: "100%",
      }}
    >
      <View
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0) onLeftWidth?.(w);
        }}
        style={{
          // `flex: 0` is flexBasis 0 on RN — the compact amount/chips would clip away.
          flexGrow: leftGrows ? 1 : 0,
          flexShrink: 1,
          flexBasis: leftGrows ? 0 : "auto",
          minWidth: leftGrows ? 0 : undefined,
          // Always clip — compact left must not paint over the identity / safe gap.
          overflow: "hidden",
          height: HEADER_CONTROL_ROW_PX,
          justifyContent: "center",
          alignItems: "flex-start",
          alignSelf: "center",
        }}
      >
        {left}
      </View>
      {centerReservePx > 0 ? (
        <View
          style={{
            // Fixed menu reserve; leftover is split by the growing side slots.
            width: centerReservePx,
            flexGrow: 0,
            flexShrink: 0,
            height: HEADER_CONTROL_ROW_PX,
            alignSelf: "center",
          }}
        />
      ) : (
        <View
          style={{
            flexGrow: 1,
            flexShrink: 1,
            // Keep air between amount and identity; never collapse to an overlay.
            minWidth: HEADER_IDENTITY_ROW_SAFE_GAP_PX,
            height: HEADER_CONTROL_ROW_PX,
            alignSelf: "center",
          }}
        />
      )}
      <View
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0) onRightWidth?.(w);
        }}
        style={{
          // Fill to the content trailing edge so flex-end children share one right edge
          // (identity row + action icons). Fit budgets still use computed side width.
          flexGrow: centerReservePx > 0 ? 1 : 0,
          flexShrink: 1,
          flexBasis: centerReservePx > 0 ? 0 : "auto",
          minWidth: 0,
          overflow: "hidden",
          height: HEADER_CONTROL_ROW_PX,
          justifyContent: "center",
          alignItems: "flex-end",
          alignSelf: "center",
        }}
      >
        {right}
      </View>
    </View>
  );
}

/** Horizontal switch-wallet glyph (two opposing arrows). */
function HeaderSwitchWalletIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8h12.5M13.5 4.5 17.5 8l-4 3.5"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20 16H7.5M10.5 19.5 6.5 16l4-3.5"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Wide multicolumn header: 15 + 30 + 10 + 30 + 15 = {@link AH.headerWideRowHeightPx}. */
const WIDE_HEADER_BAND_PX = AH.headerIconDisplaySize;
const WIDE_HEADER_PAD_PX = AH.headerWideSidePaddingVerticalPx;
const WIDE_HEADER_MID_GAP_PX = AH.headerWideSideMiddleGapPx;

/** One header band: left + right controls share a single vertical center. */
const headerControlRowStyle = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  height: WIDE_HEADER_BAND_PX,
  width: "100%" as const,
  gap: AH.addressRowGap,
};

const HEADER_ICONS_BEFORE_LANG: readonly {
  id: "copy" | "edit" | "key";
  labelKey: AppStringKey;
  Icon: (p: { color: string; size: number }) => ReactNode;
}[] = [
  { id: "copy", labelKey: "home.header.iconCopy", Icon: HeaderIconCopy },
  { id: "edit", labelKey: "home.header.iconEdit", Icon: HeaderIconEdit },
  { id: "key", labelKey: "home.header.iconKey", Icon: HeaderIconKey },
];

const HEADER_ICON_EXIT_LABEL_KEY = "home.header.iconExit" as const;

/** Brief primary flash after pointer-up so a tap is visible on web. */
const HEADER_ICON_PRESS_FLASH_MS = 180;

function HeaderActionIconButton({
  accessibilityLabel,
  onPress,
  size,
  children,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  size: number;
  children: (color: string) => ReactNode;
}) {
  const colors = useColors();
  const [flash, setFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={AH.headerPressableHitSlop}
      onPressIn={() => {
        if (flashTimerRef.current) {
          clearTimeout(flashTimerRef.current);
          flashTimerRef.current = null;
        }
        setFlash(true);
      }}
      onPressOut={() => {
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => {
          setFlash(false);
          flashTimerRef.current = null;
        }, HEADER_ICON_PRESS_FLASH_MS);
      }}
      onPress={onPress}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        // Same optical lift as Switch wallet so this glyph stays on the 30px band center.
        ...uiIconButtonVerticalCompensationTransform,
      }}
    >
      {({ pressed }) => (
        <View
          pointerEvents="none"
          style={{
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children(menuIconStrokeColor(colors, pressed || flash ? "primary" : "highlight"))}
        </View>
      )}
    </Pressable>
  );
}

/**
 * Identity overflow: three vertical squares in a transparent 30×30 safezone.
 * No undercover fill; no optical lift — shares the first-row centerline with PRO/card/amount.
 */
function HeaderIdentityMoreButton({
  accessibilityLabel,
  onPress,
  active = false,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  active?: boolean;
}) {
  const colors = useColors();
  const size = HEADER_CONTROL_ROW_PX;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: active }}
      hitSlop={AH.headerPressableHitSlop}
      onPress={onPress}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        alignSelf: "center",
        backgroundColor: "transparent",
      }}
    >
      {({ pressed }) => (
        <View
          pointerEvents="none"
          style={{
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ translateY: -1 }],
          }}
        >
          <HeaderIconMoreSquares
            color={menuIconStrokeColor(
              colors,
              // Inverse of other header glyphs: white at rest, grey while pressed.
              pressed && !active ? "highlight" : "primary",
            )}
            size={size}
          />
        </View>
      )}
    </Pressable>
  );
}

const WIDE_MENU_ITEM_KEYS = [
  { key: "get", labelKey: "home.menu.get" as const, Icon: MenuGetIcon },
  { key: "swap", labelKey: "home.menu.swap" as const, Icon: MenuSwapIcon },
  { key: "smart", labelKey: "home.menu.smart" as const, Icon: MenuSmartIcon },
  { key: "trade", labelKey: "home.menu.trade" as const, Icon: MenuTradeIcon },
  { key: "send", labelKey: "home.menu.send" as const, Icon: MenuSendIcon },
] as const;

/** Get/Swap/… row: wide = fixed `columnWidth` per item; narrow = equal `flex` columns (under profile). */
function AuthenticatedHomeMenuItems({
  colors,
  narrow,
  columnWidth,
  t,
  onMenuKeyPress,
  activeMenuKey,
}: {
  colors: ThemeColors;
  narrow: boolean;
  /** Used when `narrow` is false (centered strip). */
  columnWidth: number;
  t: (key: AppStringKey) => string;
  onMenuKeyPress: (key: (typeof WIDE_MENU_ITEM_KEYS)[number]["key"]) => void;
  /** When set, matching item stays primary; others use inactive (secondary) styling until pressed. */
  activeMenuKey?: (typeof WIDE_MENU_ITEM_KEYS)[number]["key"] | null;
}) {
  return WIDE_MENU_ITEM_KEYS.map(({ key, labelKey, Icon }) => {
    const label = t(labelKey);
    const menuActive = activeMenuKey == null || key === activeMenuKey;
    return (
    <View
      key={key}
      style={
        narrow
          ? { flex: 1, minWidth: 0, alignItems: "center" as const }
          : {
              width: columnWidth,
              minWidth: AH.wideMenuColumnWidthMin,
              alignItems: "center" as const,
            }
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={AH.headerPressableHitSlop}
        onPress={() => onMenuKeyPress(key)}
      >
        {({ pressed }) => {
          const iconVariant = pressed ? "highlight" : menuActive ? "primary" : "inactive";
          const labelColor = pressed
            ? menuIconStrokeColor(colors, "highlight")
            : menuActive
              ? menuIconStrokeColor(colors, "primary")
              : colors.secondary;
          return (
            <View style={{ alignItems: "center" }}>
              <Icon
                variant={iconVariant}
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
    );
  });
}

type HeaderMenuKey = (typeof WIDE_MENU_ITEM_KEYS)[number]["key"];

type Props = {
  /** Built-in wallet address (clipboard / switch-menu builtin row). */
  walletAddress: string;
  /** Profile label from `users.display_name`. */
  displayName: string;
  /**
   * Fallback header balance while known wallets are still loading.
   * Live total is the sum of all known wallets (+ DLLR once).
   */
  headerBalanceLabel?: string;
  /** Opens the chosen-wallet currencies dialog. */
  onBalancePress?: () => void;
  /** Wallet currencies dialog is open — inverts chip colors on the wallet control. */
  walletCurrenciesOpen?: boolean;
  /** Wide layout: highlight this header menu item; others use secondary (inactive) styling. */
  activeHeaderMenuKey?: HeaderMenuKey | null;
  /** When set, overrides width breakpoint inference (split-pane column count is authoritative). */
  layoutIsWide?: boolean;
  /** Compact: unclipped height of the collapsing bands (including the gap above the Feed/Messages strip). */
  onCompactCollapsibleLayout?: (heightPx: number) => void;
  /** Compact: sticky first-row stack (top inset + wallet row). */
  onCompactStickyLayout?: (heightPx: number) => void;
  /** Compact: top inset on the first wallet row (always; sticky only when camera band). */
  compactStickyTopInsetPx?: number;
  /** Compact: live scroll offset (native sticky fallback via translate). */
  compactScrollYPx?: number;
  /** Compact: pin the wallet row (camera / notch band only). */
  compactStickFirstRow?: boolean;
  /**
   * Compact: when > 0, past-lock solid-plate tear is active — cancel-scroll translateY for the
   * clipped plate. Visible plate height is {@link compactHeaderPullPx}.
   */
  compactHeaderPullScrollYPx?: number;
  /** Compact: visible height of the solid header plate (collapsed first-row → full stack). */
  compactHeaderPullPx?: number;
  /** Compact: vertical gesture on the sticky first row / menu (wheel / drag / pointer). */
  compactStickyScrollBridge?: {
    onTouchStart?: (event: { nativeEvent: { pageY: number; pageX?: number } }) => void;
    onTouchMove?: (event: {
      nativeEvent: { pageY: number; pageX?: number };
      preventDefault?: () => void;
      stopPropagation?: () => void;
    }) => void;
    onTouchEnd?: () => void;
    onTouchCancel?: () => void;
    onWheel?: (event: unknown) => void;
    onPointerDown?: (event: unknown) => void;
    onPointerMove?: (event: unknown) => void;
    onPointerUp?: (event: unknown) => void;
    onPointerCancel?: (event: unknown) => void;
  };
};

/**
 * Top row on authenticated home: truncated address (highlight) + header icons, space-between cluster.
 * Breakpoint uses the header shell width from `onLayout` (not only `useWindowDimensions`) so web layout matches the real column width.
 * At `firstBreakpoint` and above: centered Get/Swap/… strip overlay (painted after side columns so it is not covered on web); below: same strip under balance + profile.
 */
export function HomeAuthenticatedHeaderRow({
  walletAddress,
  displayName,
  headerBalanceLabel = "1$",
  onBalancePress,
  walletCurrenciesOpen = false,
  activeHeaderMenuKey,
  layoutIsWide,
  onCompactCollapsibleLayout,
  onCompactStickyLayout,
  compactStickyTopInsetPx = 0,
  compactScrollYPx = 0,
  compactStickFirstRow = false,
  compactHeaderPullScrollYPx = 0,
  compactHeaderPullPx = 0,
  compactStickyScrollBridge,
}: Props) {
  const headerPullActive = compactHeaderPullScrollYPx > 0 && compactHeaderPullPx > 0;
  const stickRowTranslateY =
    compactStickFirstRow && !headerPullActive ? compactScrollYPx : 0;
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();
  const colors = useColors();
  const { t, tf, toggleUiLanguage, headerLanguageToggleShows } = useAppStrings();
  const { triggerHaptic, setDisplayName } = useTelegram();
  const ton = useTonConnectSession();
  const activeWalletPreference = useActiveWalletPreference();
  useReconcileActiveWalletPreference();
  const importedWallets = useSyncExternalStore(
    subscribeImportedWallets,
    readImportedWallets,
    readImportedWallets,
  );
  const { width: windowWidth } = useWindowDimensions();
  /** Measured shell width — matches the header column, not always the browser window (`useWindowDimensions` can stay wide on web). */
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [proDialogOpen, setProDialogOpen] = useState(false);
  const [switchWalletOpen, setSwitchWalletOpen] = useState(false);
  const [switchWalletAnchor, setSwitchWalletAnchor] = useState<LayoutRectangle | null>(null);
  const [copiedDialogOpen, setCopiedDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [mnemonicDialogOpen, setMnemonicDialogOpen] = useState(false);
  const [identityMenuOpen, setIdentityMenuOpen] = useState(false);
  const [identityMenuAnchor, setIdentityMenuAnchor] = useState<LayoutRectangle | null>(null);
  const [leftSlotWidthPx, setLeftSlotWidthPx] = useState(0);
  const [chipClusterWidthPx, setChipClusterWidthPx] = useState(0);
  const [naturalAmountWidthPx, setNaturalAmountWidthPx] = useState(0);
  const [fullNameWidthPx, setFullNameWidthPx] = useState(0);
  const [firstNameWidthPx, setFirstNameWidthPx] = useState(0);
  const [firstLetterWidthPx, setFirstLetterWidthPx] = useState(0);
  const [snippetWidthPx, setSnippetWidthPx] = useState(0);
  const [switchWalletWidthPx, setSwitchWalletWidthPx] = useState(0);
  const [compactStickyNaturalHeightPx, setCompactStickyNaturalHeightPx] = useState(0);
  const [compactCollapsibleNaturalHeightPx, setCompactCollapsibleNaturalHeightPx] = useState(0);
  /** Past-lock solid plate: full header height used to translate the stack as one rigid body. */
  const compactPlateFullHPx =
    compactStickyNaturalHeightPx + compactCollapsibleNaturalHeightPx;
  const compactPlateTranslateYPx =
    headerPullActive && compactPlateFullHPx > 0
      ? compactHeaderPullPx - compactPlateFullHPx
      : 0;
  const switchWalletRef = useRef<View>(null);
  const identityOverflowRef = useRef<View>(null);
  const headerNameChoiceRef = useRef<string | null>(null);
  const proSubscribed = useSyncExternalStore(
    subscribeProAccess,
    isProAccessActive,
    () => false,
  );

  useEffect(() => {
    return subscribeOpenProAccess(() => setProDialogOpen(true));
  }, []);

  useEffect(() => {
    ton.refreshRememberedWallets();
    // Mount-only: `ton` identity changes whenever rememberedWallets updates,
    // so depending on `[ton]` caused an infinite refresh → TonAPI storm.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only
  }, []);

  const openSwitchWalletMenu = useCallback(() => {
    switchWalletRef.current?.measureInWindow((x, y, width, height) => {
      setSwitchWalletAnchor({ x, y, width, height });
      setSwitchWalletOpen(true);
    });
  }, []);
  const openIdentityOverflowMenu = useCallback(() => {
    identityOverflowRef.current?.measureInWindow((x, y, width, height) => {
      setIdentityMenuAnchor({ x, y, width, height });
      setIdentityMenuOpen(true);
    });
  }, []);
  const liveViewportWidthPx = readAuthenticatedHomeLayoutWidthPx(windowWidth);
  const widthForLayout = measuredWidth ?? liveViewportWidthPx;
  const atOrAboveFirstBreakpoint =
    widthForLayout > AH.firstBreakpoint && (layoutIsWide ?? true);
  const wideMenuColumnWidth = authenticatedHomeWideMenuColumnWidthPx(widthForLayout);
  const wideMenuStripWidth = atOrAboveFirstBreakpoint
    ? wideMenuColumnWidth * WIDE_MENU_ITEM_KEYS.length
    : 0;
  const headerMenuActiveKey =
    atOrAboveFirstBreakpoint && activeHeaderMenuKey ? activeHeaderMenuKey : null;
  const builtinTrimmed = trimWalletAddress(walletAddress);
  const activeAddress = resolveActiveWalletAddress({
    builtinAddress: builtinTrimmed,
    preference: activeWalletPreference,
    tonConnected: ton.connected,
    tonAddress: ton.friendlyAddress || ton.address,
  });
  const trimmed = trimWalletAddress(activeAddress);

  const knownWalletAddresses = useMemo(() => {
    const out: string[] = [];
    const push = (value: string | null | undefined) => {
      const next = (value ?? "").trim();
      if (next) out.push(next);
    };
    push(builtinTrimmed);
    for (const row of importedWallets) {
      push(row.friendlyAddress || row.address);
    }
    for (const row of ton.rememberedWallets) {
      push(row.friendlyAddress || row.address);
    }
    push(ton.friendlyAddress || ton.address);
    return out;
  }, [
    builtinTrimmed,
    importedWallets,
    ton.address,
    ton.friendlyAddress,
    ton.rememberedWallets,
  ]);

  const allWalletsBalanceLabel = useAllWalletsHeaderBalanceLabel(knownWalletAddresses, {
    enabled: knownWalletAddresses.length > 0,
  });
  const balanceLabel =
    knownWalletAddresses.length > 0 ? allWalletsBalanceLabel : headerBalanceLabel;
  const headerIdentity = (() => {
    const name = displayName.trim();
    const emDash = t("common.emDash");
    if (!name || name === emDash) {
      return {
        fullName: null as string | null,
        firstName: null as string | null,
        firstLetter: null as string | null,
      };
    }
    const first = name.split(/\s+/).filter(Boolean)[0] ?? name;
    return { fullName: name, firstName: first, firstLetter: first.slice(0, 1) };
  })();
  const innerContentW = Math.max(0, widthForLayout - 2 * layout.contentSideInsetPx);
  const estimatedWideSidePx = Math.max(0, (innerContentW - wideMenuStripWidth) / 2);
  const nameFloorPx = headerIdentity.firstLetter
    ? Math.max(
        firstLetterWidthPx,
        firstNameWidthPx > 0 && headerIdentity.firstName
          ? Math.ceil(firstNameWidthPx / Math.max(1, headerIdentity.firstName.length))
          : 0,
        8,
      )
    : 0;
  const explorerChromePx = trimmed ? HEADER_EXPLORER_PX + HEADER_IDENTITY_GAP_PX : 0;
  const monoCharWidthPx = 9;
  const minSnippet = walletAddressHeaderSnippet(
    trimmed,
    WALLET_ADDRESS_HEADER_TAIL_MIN_LENGTH,
  );
  // Overflow gate: address (+ explorer) only — name shrinks via pickHeaderDisplayName.
  // Collapse to the more chip only when even this minimized cluster cannot fit with the safe gap.
  const minIdentityClusterPx =
    (trimmed ? minSnippet.length * monoCharWidthPx : 0) + explorerChromePx;
  // Amount reservation still leaves room for a one-letter name when present + safe gap.
  const identityReservePx =
    minIdentityClusterPx +
    (nameFloorPx > 0 ? nameFloorPx + HEADER_IDENTITY_GAP_PX : 0);
  // Compact: reserve amount width at the font size that still leaves room for the
  // minimized identity (or the overflow chip) plus the safe gap to the right cluster.
  const compactAmountBudgetPx = Math.max(
    0,
    innerContentW -
      chipClusterWidthPx -
      HEADER_IDENTITY_ROW_SAFE_GAP_PX -
      Math.max(identityReservePx, HEADER_CONTROL_ROW_PX),
  );
  const compactAmountFontPx = fitHeaderAmountFontSize(
    naturalAmountWidthPx,
    compactAmountBudgetPx,
  );
  const compactAmountWidthPx =
    naturalAmountWidthPx > 0
      ? Math.ceil(
          naturalAmountWidthPx * (compactAmountFontPx / HEADER_AMOUNT_FONT_MAX_PX),
        )
      : 0;
  // Wide fit budget is the fair side share around the menu — not the intrinsic
  // right column’s onLayout width (that shrink-wraps and collapses fit).
  const wideSideBudgetPx = estimatedWideSidePx;
  const nameSlotPx = atOrAboveFirstBreakpoint
    ? wideSideBudgetPx
    : Math.max(
        0,
        leftSlotWidthPx > 0
          ? innerContentW - leftSlotWidthPx - HEADER_IDENTITY_ROW_SAFE_GAP_PX
          : innerContentW -
              chipClusterWidthPx -
              compactAmountWidthPx -
              HEADER_IDENTITY_ROW_SAFE_GAP_PX,
      );
  // Prefer `..` + 5 address chars; step down to 2 so one name letter still fits.
  const addressTailLength = trimmed
    ? fitHeaderAddressTailLength({
        identitySlotPx: nameSlotPx,
        monoCharWidthPx,
        explorerChromePx,
        nameFloorPx: nameFloorPx > 0 ? nameFloorPx + HEADER_IDENTITY_GAP_PX : 0,
      })
    : 5;
  const displaySnippet = walletAddressHeaderSnippet(trimmed, addressTailLength);
  const identityOverflow =
    Boolean(trimmed || headerIdentity.fullName) &&
    shouldUseHeaderIdentityOverflow({
      identitySlotPx: nameSlotPx,
      minClusterPx: minIdentityClusterPx,
      overflowChipPx: HEADER_CONTROL_ROW_PX,
      collapseSlackPx: HEADER_IDENTITY_OVERFLOW_COLLAPSE_SLACK_PX,
    });
  const identityChromePx = identityOverflow
    ? HEADER_CONTROL_ROW_PX
    : (snippetWidthPx > 0 ? snippetWidthPx : displaySnippet.length * monoCharWidthPx) +
      explorerChromePx;
  const slotReady =
    (headerIdentity.fullName ? fullNameWidthPx > 0 : true) &&
    (atOrAboveFirstBreakpoint
      ? wideSideBudgetPx > 0
      : chipClusterWidthPx > 0 || naturalAmountWidthPx > 0);
  const availableNamePx = headerIdentity.fullName
    ? Math.max(
        nameFloorPx,
        nameSlotPx - identityChromePx - HEADER_IDENTITY_GAP_PX,
      )
    : Math.max(0, nameSlotPx - identityChromePx);
  const walletNameLabel = pickHeaderDisplayName({
    fullName: headerIdentity.fullName,
    firstName: headerIdentity.firstName,
    availablePx: availableNamePx,
    fullNameWidthPx,
    firstNameWidthPx,
    firstLetterWidthPx,
    slotReady,
    previous: headerNameChoiceRef.current,
  });
  useLayoutEffect(() => {
    headerNameChoiceRef.current = walletNameLabel;
  }, [walletNameLabel]);
  const amountAvailablePx = atOrAboveFirstBreakpoint
    ? Math.max(0, leftSlotWidthPx - chipClusterWidthPx)
    : Math.max(
        0,
        innerContentW -
          chipClusterWidthPx -
          identityChromePx -
          HEADER_IDENTITY_ROW_SAFE_GAP_PX,
      );
  const amountFontSizePx = fitHeaderAmountFontSize(naturalAmountWidthPx, amountAvailablePx);
  const actionIconsAvailablePx = Math.max(
    0,
    (atOrAboveFirstBreakpoint
      ? wideSideBudgetPx
      : Math.max(0, innerContentW - switchWalletWidthPx - AH.addressRowGap)) -
      HEADER_ACTION_MENU_CLEARANCE_PX,
  );
  // Smaller than menu glyphs (30); leave clearance so copy/edit/… do not hug Get/Swap/….
  const { sizePx: actionIconSizePx, gapPx: actionIconGapPx } = fitHeaderActionIconSize(
    actionIconsAvailablePx,
    HEADER_ACTION_ICON_COUNT,
    HEADER_ACTION_ICON_MAX_PX,
    HEADER_ACTION_ICON_MIN_PX,
    HEADER_ACTION_ICON_GAP_MAX_PX,
  );

  const copyFullWalletAddress = useCallback(async () => {
    if (!trimmed) return;
    await Clipboard.setStringAsync(trimmed);
    setCopiedDialogOpen(true);
  }, [trimmed]);

  const onDisplayNameSaved = useCallback(
    (name: string) => {
      setDisplayName(name);
      const prev = getLastAuthSessionPayload();
      if (prev) {
        rememberAuthSessionPayload({
          authenticated: prev.authenticated,
          telegram_username: prev.telegram_username,
          display_name: name,
          has_wallet: prev.has_wallet,
          wallet_required: prev.wallet_required,
          auth_provider: prev.auth_provider,
          email: prev.email,
          provider_username: prev.provider_username,
          telegram_username_actual: prev.telegram_username_actual,
          wallet: prev.wallet,
        });
      }
    },
    [setDisplayName],
  );
  const balanceButton = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: HEADER_CONTROL_ROW_PX,
        gap: 0,
        maxWidth: "100%",
        flexShrink: 0,
      }}
    >
      <View
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0) setChipClusterWidthPx((prev) => (prev === w ? prev : w));
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: HEADER_CONTROL_ROW_PX,
          flexShrink: 0,
        }}
      >
        <UndercoverProButton
          accessibilityLabel={t("pro.buyCta")}
          active={proDialogOpen}
          subscribed={proSubscribed}
          onPress={() => setProDialogOpen((open) => !open)}
        />
        <View style={{ width: AH.headerIconGap, flexShrink: 0 }} />
        <UndercoverWalletButton
          accessibilityLabel={t("home.header.balanceExpandHint")}
          active={walletCurrenciesOpen}
          disabled={!onBalancePress}
          onPress={onBalancePress}
        />
        <View
          style={{
            width: Math.max(0, AH.headerIconGap - WALLET_TO_BALANCE_OPTICAL_PULL_PX),
            flexShrink: 0,
          }}
        />
      </View>
      <View
        style={{
          height: HEADER_CONTROL_ROW_PX,
          justifyContent: "center",
          alignItems: "flex-start",
          flexShrink: 0,
        }}
      >
        <Text
          {...displayAmountTextProps}
          numberOfLines={1}
          ellipsizeMode="clip"
          style={[
            homeWalletBalanceHeaderText,
            {
              color: colors.primary,
              fontSize: amountFontSizePx,
              // Tight line box + flex-centered parent = same 30px centerline as undercover chips.
              lineHeight: amountFontSizePx,
              ...HEADER_BAND_TEXT_ALIGN_TRANSFORM,
            },
          ]}
        >
          {balanceLabel}
        </Text>
      </View>
    </View>
  );

  const headerMonoLineStyle = [
    homeWalletAddressHeaderText,
    {
      color: colors.secondary,
      lineHeight: HEADER_CONTROL_ROW_PX,
      ...HEADER_BAND_TEXT_ALIGN_TRANSFORM,
    },
  ];

  const walletAddressRow = identityOverflow ? (
    <View
      ref={identityOverflowRef}
      collapsable={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        height: HEADER_CONTROL_ROW_PX,
        flexShrink: 0,
      }}
    >
      <HeaderIdentityMoreButton
        accessibilityLabel={t("home.header.walletIdentityMoreA11y")}
        active={identityMenuOpen}
        onPress={openIdentityOverflowMenu}
      />
    </View>
  ) : (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        alignSelf: "stretch",
        width: "100%",
        height: HEADER_CONTROL_ROW_PX,
      }}
    >
      {/*
        Intrinsic-width cluster: a large name `maxWidth` must not expand the row and
        leave “Morgan” looking inset from the trailing edge.
      */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: HEADER_IDENTITY_GAP_PX,
          flexGrow: 0,
          flexShrink: 1,
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tf("home.header.walletAddressA11y", { snippet: displaySnippet })}
          accessibilityHint={t("home.header.copyWalletHint")}
          disabled={!trimmed}
          hitSlop={AH.headerPressableHitSlop}
          onPress={() => {
            void copyFullWalletAddress();
          }}
          style={{
            flexGrow: 0,
            flexShrink: 0,
            height: HEADER_CONTROL_ROW_PX,
            justifyContent: "center",
          }}
        >
          <Text
            numberOfLines={1}
            onLayout={(e) => {
              const w = Math.round(e.nativeEvent.layout.width);
              if (w > 0) setSnippetWidthPx((prev) => (prev === w ? prev : w));
            }}
            style={headerMonoLineStyle}
          >
            {displaySnippet}
          </Text>
        </Pressable>
        {trimmed ? (
          <TonviewerExplorerButton
            address={trimmed}
            accessibilityLabel={t("home.header.openTonviewerA11y")}
          />
        ) : null}
        {walletNameLabel ? (
          <Text
            numberOfLines={1}
            ellipsizeMode="clip"
            style={[
              ...headerMonoLineStyle,
              {
                // Do not set maxWidth here — on web it expands the text box past the
                // glyphs and leaves “Morgan” inset from the trailing edge. Label choice
                // already respects availableNamePx via pickHeaderDisplayName.
                flexGrow: 0,
                flexShrink: 0,
              },
            ]}
          >
            {walletNameLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const switchWalletRow = (
    <View
      ref={switchWalletRef}
      collapsable={false}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0) setSwitchWalletWidthPx((prev) => (prev === w ? prev : w));
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("home.header.switchWalletA11y")}
        accessibilityState={{ expanded: switchWalletOpen }}
        hitSlop={AH.headerPressableHitSlop}
        onPress={openSwitchWalletMenu}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 6,
          flexShrink: 1,
          minWidth: 0,
          height: HEADER_CONTROL_ROW_PX,
        }}
      >
        <Text
          numberOfLines={1}
          style={[
            homeHeaderProfileNameText,
            {
              color: colors.primary,
              lineHeight: HEADER_CONTROL_ROW_PX,
              textAlign: "left",
            },
          ]}
        >
          {t("home.header.switchWallet")}
        </Text>
        <View
          style={{
            width: 16,
            height: HEADER_CONTROL_ROW_PX,
            alignItems: "center",
            justifyContent: "center",
            ...uiIconButtonVerticalCompensationTransform,
          }}
        >
          <HeaderSwitchWalletIcon color={menuIconStrokeColor(colors, "highlight")} size={16} />
        </View>
      </Pressable>
    </View>
  );

  const handleMenuKeyPress = useCallback(
    (key: (typeof WIDE_MENU_ITEM_KEYS)[number]["key"]) => {
      if (atOrAboveFirstBreakpoint) {
        openAuthenticatedHomeRightPanel(key);
        if (key === "swap") {
          openSwapCurrenciesBrowse();
        }
        focusAuthenticatedHomeMiddleColumnOnHeaderPanel();
        if (pathname !== "/" && pathname !== "" && pathname != null) {
          router.replace("/");
        }
        return;
      }
      if (key === "swap") {
        openSwapCurrenciesBrowse();
      }
      const route = `/${key}`;
      if (pathname !== route) {
        router.push(route as any);
      } else if (key === "swap") {
        openSwapCurrenciesBrowse();
      }
    },
    [atOrAboveFirstBreakpoint, pathname, router],
  );

  const handleSignOut = useCallback(() => {
    if (Platform.OS !== "web") {
      triggerHaptic("light");
    }
    logPageDisplay("home_header_sign_out");
    signOut();
    router.replace("/");
  }, [router, signOut, triggerHaptic]);

  const headerActionIconsRow = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: HEADER_CONTROL_ROW_PX,
        gap: actionIconGapPx,
        justifyContent: "flex-end",
        alignSelf: "stretch",
        width: "100%",
        flexShrink: 1,
        minWidth: 0,
        // Keep a stable air gap from the centered Get/Swap/… strip (and switch-wallet on compact).
        paddingLeft: HEADER_ACTION_MENU_CLEARANCE_PX,
      }}
    >
      {HEADER_ICONS_BEFORE_LANG.map(({ id, Icon, labelKey }) => {
        const accessibilityLabel = t(labelKey);
        return (
          <HeaderActionIconButton
            key={id}
            size={actionIconSizePx}
            accessibilityLabel={accessibilityLabel}
            onPress={() => {
              if (id === "copy") {
                void copyFullWalletAddress();
                return;
              }
              if (id === "edit") {
                setRenameDialogOpen(true);
                return;
              }
              if (id === "key") {
                setMnemonicDialogOpen(true);
              }
            }}
          >
            {(color) => <Icon color={color} size={actionIconSizePx} />}
          </HeaderActionIconButton>
        );
      })}
      <HeaderActionIconButton
        size={actionIconSizePx}
        accessibilityLabel={
          headerLanguageToggleShows === "en"
            ? t("home.header.languageIconSwitchToEn")
            : headerLanguageToggleShows === "ru"
              ? t("home.header.languageIconSwitchToRu")
              : t("home.header.languageIconSwitchToZh")
        }
        onPress={() => {
          if (Platform.OS !== "web") {
            triggerHaptic("light");
          }
          toggleUiLanguage();
        }}
      >
        {(color) =>
          headerLanguageToggleShows === "en" ? (
            <HeaderIconEn color={color} size={actionIconSizePx} />
          ) : headerLanguageToggleShows === "ru" ? (
            <HeaderIconRu color={color} size={actionIconSizePx} />
          ) : (
            <HeaderIconZh color={color} size={actionIconSizePx} />
          )
        }
      </HeaderActionIconButton>
      <HeaderActionIconButton
        size={actionIconSizePx}
        accessibilityLabel={t(HEADER_ICON_EXIT_LABEL_KEY)}
        onPress={handleSignOut}
      >
        {(color) => (
          <HeaderIconExit color={color} size={actionIconSizePx} />
        )}
      </HeaderActionIconButton>
    </View>
  );

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
          t={t}
          onMenuKeyPress={handleMenuKeyPress}
          activeMenuKey={headerMenuActiveKey}
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
    <>
    <View
      pointerEvents="none"
      style={{ position: "absolute", opacity: 0, left: 0, top: 0, zIndex: -1 }}
    >
      <Text
        {...displayAmountTextProps}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0) setNaturalAmountWidthPx((prev) => (prev === w ? prev : w));
        }}
        style={[
          homeWalletBalanceHeaderText,
          {
            fontSize: HEADER_AMOUNT_FONT_MAX_PX,
            lineHeight: HEADER_CONTROL_ROW_PX,
          },
        ]}
      >
        {balanceLabel}
      </Text>
      {headerIdentity.fullName ? (
        <Text
          onLayout={(e) => {
            const w = Math.round(e.nativeEvent.layout.width);
            if (w > 0) setFullNameWidthPx((prev) => (prev === w ? prev : w));
          }}
          style={headerMonoLineStyle}
        >
          {headerIdentity.fullName}
        </Text>
      ) : null}
      {headerIdentity.firstName ? (
        <Text
          onLayout={(e) => {
            const w = Math.round(e.nativeEvent.layout.width);
            if (w > 0) setFirstNameWidthPx((prev) => (prev === w ? prev : w));
          }}
          style={headerMonoLineStyle}
        >
          {headerIdentity.firstName}
        </Text>
      ) : null}
      {headerIdentity.firstLetter ? (
        <Text
          onLayout={(e) => {
            const w = Math.round(e.nativeEvent.layout.width);
            if (w > 0) setFirstLetterWidthPx((prev) => (prev === w ? prev : w));
          }}
          style={headerMonoLineStyle}
        >
          {headerIdentity.firstLetter}
        </Text>
      ) : null}
    </View>
    {/* Outer shell: full width; marginBottom = gap under header+divider before body (see theme `headerRowMarginBottom`). */}
    <View
      style={{
        width: "100%",
        marginBottom: AH.headerRowMarginBottom,
        overflow: "visible",
        backgroundColor: !atOrAboveFirstBreakpoint ? colors.background : undefined,
      }}
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
      <View
        style={{
          width: "100%",
          paddingHorizontal: layout.contentSideInsetPx,
          backgroundColor: !atOrAboveFirstBreakpoint ? colors.background : undefined,
        }}
      >
        {atOrAboveFirstBreakpoint ? (
          <View
            style={{
              flexDirection: "column",
              justifyContent: "center",
              width: "100%",
              position: "relative",
              height: AH.headerWideRowHeightPx,
              paddingTop: WIDE_HEADER_PAD_PX,
              paddingBottom: WIDE_HEADER_PAD_PX,
              gap: WIDE_HEADER_MID_GAP_PX,
              overflow: "visible",
            }}
          >
            {/*
              Shared rows (not side columns): left+right on each band share one vertical center.
              Top: balance · address/name · Bottom: switch wallet · action icons.
            */}
            <HeaderBandSlots
              centerReservePx={wideMenuStripWidth}
              leftGrows
              onLeftWidth={(w) => setLeftSlotWidthPx((prev) => (prev === w ? prev : w))}
              left={balanceButton}
              right={walletAddressRow}
            />
            <HeaderBandSlots
              centerReservePx={wideMenuStripWidth}
              leftGrows
              left={switchWalletRow}
              right={headerActionIconsRow}
            />
            {wideMenuStrip}
          </View>
        ) : (
          <View
            style={{
              width: "100%",
              flexDirection: "column",
              backgroundColor: colors.background,
              zIndex: headerPullActive || compactStickFirstRow ? 6 : 1,
              // Past-lock: one solid plate — clip height follows the tear; inner stack
              // translates as a rigid body (no height-clip shrink of individual rows).
              ...(headerPullActive
                ? {
                    transform: [{ translateY: compactHeaderPullScrollYPx }],
                    height: compactHeaderPullPx,
                    overflow: "hidden" as const,
                    marginBottom: Math.max(
                      0,
                      compactStickyNaturalHeightPx +
                        compactCollapsibleNaturalHeightPx -
                        compactHeaderPullPx,
                    ),
                    ...(Platform.OS === "web"
                      ? ({ willChange: "transform", touchAction: "none" } as object)
                      : null),
                  }
                : null),
            }}
            onTouchStart={compactStickyScrollBridge?.onTouchStart}
            onTouchMove={compactStickyScrollBridge?.onTouchMove}
            onTouchEnd={compactStickyScrollBridge?.onTouchEnd}
            onTouchCancel={compactStickyScrollBridge?.onTouchCancel}
            {...(Platform.OS === "web" && compactStickyScrollBridge
              ? ({
                  ...(compactStickyScrollBridge.onWheel
                    ? { onWheel: compactStickyScrollBridge.onWheel }
                    : null),
                  ...(compactStickyScrollBridge.onPointerDown
                    ? {
                        onPointerDown: compactStickyScrollBridge.onPointerDown,
                        onPointerMove: compactStickyScrollBridge.onPointerMove,
                        onPointerUp: compactStickyScrollBridge.onPointerUp,
                        onPointerCancel: compactStickyScrollBridge.onPointerCancel,
                      }
                    : null),
                } as object)
              : {})}
          >
            {headerPullActive ? (
              <View
                style={{
                  width: "100%",
                  backgroundColor: colors.background,
                  transform: [{ translateY: compactPlateTranslateYPx }],
                  ...(Platform.OS === "web" ? ({ willChange: "transform" } as object) : null),
                }}
              >
                <View
                  onLayout={(e) => {
                    const h = Math.round(e.nativeEvent.layout.height);
                    if (h > 0) {
                      setCompactStickyNaturalHeightPx((prev) => (prev === h ? prev : h));
                      onCompactStickyLayout?.(h);
                    }
                  }}
                  style={{
                    width: "100%",
                    backgroundColor: colors.background,
                    paddingTop: compactStickyTopInsetPx,
                    flexShrink: 0,
                  }}
                >
                  <HeaderBandSlots
                    centerReservePx={0}
                    leftGrows={false}
                    left={balanceButton}
                    right={walletAddressRow}
                  />
                </View>
                <View
                  onLayout={(e) => {
                    const h = Math.round(e.nativeEvent.layout.height);
                    if (h <= 0) return;
                    setCompactCollapsibleNaturalHeightPx((prev) => (prev === h ? prev : h));
                    onCompactCollapsibleLayout?.(h);
                  }}
                  style={{
                    width: "100%",
                    paddingBottom: AH.leftNavStripMarginTopPx,
                    backgroundColor: colors.background,
                    flexShrink: 0,
                  }}
                >
                  <View style={{ ...headerControlRowStyle, marginTop: WIDE_HEADER_MID_GAP_PX }}>
                    {switchWalletRow}
                    {headerActionIconsRow}
                  </View>
                  <View style={{ marginTop: AH.headerDividerTopGap, width: "100%" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
                      <AuthenticatedHomeMenuItems
                        colors={colors}
                        narrow
                        columnWidth={0}
                        t={t}
                        onMenuKeyPress={handleMenuKeyPress}
                        activeMenuKey={headerMenuActiveKey}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <>
                <View
                  onLayout={(e) => {
                    const h = Math.round(e.nativeEvent.layout.height);
                    if (h > 0) {
                      setCompactStickyNaturalHeightPx((prev) => (prev === h ? prev : h));
                      onCompactStickyLayout?.(h);
                    }
                  }}
                  style={{
                    width: "100%",
                    backgroundColor: colors.background,
                    paddingTop: compactStickyTopInsetPx,
                    overflow: "visible",
                    ...(stickRowTranslateY !== 0
                      ? { transform: [{ translateY: stickRowTranslateY }] }
                      : null),
                    ...(Platform.OS === "web"
                      ? ({
                          ...(stickRowTranslateY !== 0 ? { willChange: "transform" } : null),
                          touchAction: "none",
                        } as object)
                      : null),
                  }}
                >
                  <HeaderBandSlots
                    centerReservePx={0}
                    leftGrows={false}
                    left={balanceButton}
                    right={walletAddressRow}
                  />
                </View>
                <View style={{ width: "100%" }}>
                  <View
                    onLayout={(e) => {
                      const h = Math.round(e.nativeEvent.layout.height);
                      if (h <= 0) return;
                      setCompactCollapsibleNaturalHeightPx((prev) => (prev === h ? prev : h));
                      onCompactCollapsibleLayout?.(h);
                    }}
                    style={{
                      width: "100%",
                      paddingBottom: AH.leftNavStripMarginTopPx,
                      backgroundColor: colors.background,
                    }}
                  >
                    <View style={{ ...headerControlRowStyle, marginTop: WIDE_HEADER_MID_GAP_PX }}>
                      {switchWalletRow}
                      {headerActionIconsRow}
                    </View>
                    <View style={{ marginTop: AH.headerDividerTopGap, width: "100%" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
                        <AuthenticatedHomeMenuItems
                          colors={colors}
                          narrow
                          columnWidth={0}
                          t={t}
                          onMenuKeyPress={handleMenuKeyPress}
                          activeMenuKey={headerMenuActiveKey}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </>
            )}
          </View>
        )}
      </View>
      {atOrAboveFirstBreakpoint ? (
        <View
          pointerEvents="none"
          style={{
            height: AH.headerDividerHeight,
            width: "100%",
            backgroundColor: colors.highlight,
            flexShrink: 0,
          }}
        />
      ) : null}
    </View>
    <ProAccessDialog visible={proDialogOpen} onClose={() => setProDialogOpen(false)} />
    <SwitchWalletMenu
      visible={switchWalletOpen}
      anchor={switchWalletAnchor}
      builtinAddress={builtinTrimmed}
      onClose={() => setSwitchWalletOpen(false)}
    />
    <HeaderWalletIdentityMenu
      visible={identityMenuOpen}
      anchor={identityMenuAnchor}
      address={trimmed}
      displayName={
        headerIdentity.fullName ??
        (displayName.trim() === t("common.emDash") ? null : displayName.trim() || null)
      }
      onCopyAddress={() => {
        void copyFullWalletAddress();
      }}
      onClose={() => setIdentityMenuOpen(false)}
    />
    <HeaderAddressCopiedDialog
      visible={copiedDialogOpen}
      onClose={() => setCopiedDialogOpen(false)}
    />
    <HeaderRenameDisplayNameDialog
      visible={renameDialogOpen}
      initialName={displayName.trim() === t("common.emDash") ? "" : displayName}
      onClose={() => setRenameDialogOpen(false)}
      onSaved={onDisplayNameSaved}
    />
    <HeaderWalletMnemonicDialog
      visible={mnemonicDialogOpen}
      onClose={() => setMnemonicDialogOpen(false)}
    />
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "../../auth/AuthContext";
import { useAppStrings } from "../../locales/AppStringsContext";
import { useAuthenticatedHomeRouteWideLayout } from "../authenticatedHomeLayoutWidth";
import { openAuthenticatedHomeRightPanel } from "../authenticatedHomeRightPanel";
import { focusAuthenticatedHomeMiddleColumnOnHeaderPanel } from "../authenticatedHomeSelectedChat";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../fonts";
import { setSmartActivePurpose } from "../smart/smartActivePurposeStore";
import { layout, typographyRect15, useColors } from "../theme";
import { useTonConnectSession } from "../ton/TonConnectProvider";
import { useDeployOwnerContract } from "./useDeployOwnerContract";
import { HspScrollColumn } from "../components/HspScrollColumn";
import { WelcomeLanguageSwitcher } from "../components/WelcomeLanguageSwitcher";
import { OwnerDeploySignInDialog } from "./OwnerDeploySignInDialog";
import { markOwnerDeployAfterAuth, takeOwnerDeployAfterAuth } from "./ownerDeployAfterAuth";

const MAX_CONTENT_WIDTH = 560;
const WIDE_MIN = 480;

const BENEFIT_KEYS = [
  "ownerDeploy.benefit.control",
  "ownerDeploy.benefit.transfer",
  "ownerDeploy.benefit.walletLike",
  "ownerDeploy.benefit.fee",
  "ownerDeploy.benefit.program",
] as const;

function uiFont() {
  return Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR;
}

/**
 * Public landing at `/owner-deploy`: Owner contract benefits, TonConnect deploy
 * of the Tolk Owner contract, or sign-in → authenticated home with Owner selected.
 */
export function OwnerDeployPage() {
  const colors = useColors();
  const { t, tf } = useAppStrings();
  const router = useRouter();
  const { isAuthenticated, authHydrated } = useAuth();
  const ton = useTonConnectSession();
  const ownerDeploy = useDeployOwnerContract();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= WIDE_MIN;
  const isWideHome = useAuthenticatedHomeRouteWideLayout();

  const [signInOpen, setSignInOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<"ok" | "err" | null>(null);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) return;
    takeOwnerDeployAfterAuth();
    setSmartActivePurpose("owner");
    openAuthenticatedHomeRightPanel("smart");
    focusAuthenticatedHomeMiddleColumnOnHeaderPanel();
    router.replace(isWideHome ? "/" : "/smart");
  }, [authHydrated, isAuthenticated, isWideHome, router]);

  const openSignIn = useCallback(() => {
    markOwnerDeployAfterAuth();
    setSignInOpen(true);
  }, []);

  const onDeployWithTonConnect = useCallback(async () => {
    setStatusMsg(null);
    setStatusKind(null);
    const result = await ownerDeploy.deploy({
      title: t("ownerDeploy.title"),
      text: t("ownerDeploy.subtitle"),
      ownerWallet: ton.address ?? "",
    });
    if (!result.message) return;
    setStatusKind(result.ok ? "ok" : "err");
    setStatusMsg(result.message);
  }, [ownerDeploy.deploy, t, ton.address]);

  if (!authHydrated || isAuthenticated) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const lead = t("smart.purposeDescLead.owner");
  const body = t("smart.purposeDescBody.owner");

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <HspScrollColumn
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: layout.contentSideInsetPx },
        ]}
      >
        <View style={[styles.hero, { maxWidth: MAX_CONTENT_WIDTH }]}>
          <WelcomeLanguageSwitcher />
          <Text
            style={[
              styles.title,
              isWide ? styles.titleWide : styles.titleNarrow,
              { color: colors.primary, fontFamily: uiFont() },
            ]}
          >
            {t("ownerDeploy.title")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.secondary, fontFamily: uiFont() }]}>
            {t("ownerDeploy.subtitle")}
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              maxWidth: MAX_CONTENT_WIDTH,
              borderColor: colors.highlight,
              backgroundColor: colors.undercover,
            },
          ]}
        >
          <Text style={[styles.cardLead, { color: colors.primary, fontFamily: uiFont() }]}>
            {lead}
          </Text>
          <Text style={[typographyRect15, { color: colors.secondary, fontFamily: uiFont() }]}>
            {body.trimStart()}
          </Text>
        </View>

        <View style={[styles.benefits, { maxWidth: MAX_CONTENT_WIDTH }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary, fontFamily: uiFont() }]}>
            {t("ownerDeploy.benefitsTitle")}
          </Text>
          {BENEFIT_KEYS.map((key) => (
            <View key={key} style={styles.benefitRow}>
              <Text style={[styles.benefitMark, { color: colors.accent }]}>·</Text>
              <Text
                style={[
                  typographyRect15,
                  styles.benefitText,
                  { color: colors.primary, fontFamily: uiFont() },
                ]}
              >
                {t(key)}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.actions, { maxWidth: MAX_CONTENT_WIDTH }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary, fontFamily: uiFont() }]}>
            {t("ownerDeploy.actionsTitle")}
          </Text>
          <Text style={[typographyRect15, { color: colors.secondary, fontFamily: uiFont() }]}>
            {t("ownerDeploy.actionsHint")}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("ownerDeploy.deployCta")}
            disabled={ownerDeploy.busy}
            onPress={() => {
              void onDeployWithTonConnect();
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.undercover,
                borderColor: colors.primary,
                opacity: ownerDeploy.busy ? 0.7 : pressed ? 0.85 : 1,
              },
            ]}
          >
            {ownerDeploy.busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.btnLabel, { color: colors.primary, fontFamily: uiFont() }]}>
                {ton.connected
                  ? t("ownerDeploy.deployCta")
                  : t("ownerDeploy.connectAndDeployCta")}
              </Text>
            )}
          </Pressable>

          {ton.connected && ton.friendlyAddress ? (
            <Text
              style={[styles.walletHint, { color: colors.secondary, fontFamily: uiFont() }]}
              numberOfLines={1}
            >
              {tf("ownerDeploy.connectedAs", {
                address: shortenAddress(ton.friendlyAddress),
              })}
            </Text>
          ) : null}

          <View style={styles.orRow}>
            <View style={[styles.orLine, { backgroundColor: colors.highlight }]} />
            <Text style={[styles.orText, { color: colors.secondary, fontFamily: uiFont() }]}>
              {t("ownerDeploy.or")}
            </Text>
            <View style={[styles.orLine, { backgroundColor: colors.highlight }]} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("ownerDeploy.signInCta")}
            onPress={openSignIn}
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                borderColor: colors.highlight,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.btnLabel, { color: colors.primary, fontFamily: uiFont() }]}>
              {t("ownerDeploy.signInCta")}
            </Text>
          </Pressable>

          <Text style={[styles.signInHint, { color: colors.secondary, fontFamily: uiFont() }]}>
            {t("ownerDeploy.signInHint")}
          </Text>

          {statusMsg ? (
            <Text
              style={[
                styles.status,
                {
                  color: statusKind === "ok" ? colors.primary : colors.secondary,
                  fontFamily: uiFont(),
                },
              ]}
            >
              {statusMsg}
            </Text>
          ) : null}
        </View>
      </HspScrollColumn>

      <OwnerDeploySignInDialog visible={signInOpen} onClose={() => setSignInOpen(false)} />
    </View>
  );
}

function shortenAddress(address: string): string {
  const a = address.trim();
  if (a.length <= 14) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  scrollContent: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 48,
    gap: 28,
  },
  hero: {
    width: "100%",
    alignItems: "center",
    gap: 14,
  },
  title: {
    fontWeight: "400",
    textAlign: "center",
    includeFontPadding: false,
  },
  titleWide: {
    fontSize: 35,
    lineHeight: 42,
  },
  titleNarrow: {
    fontSize: 25,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 420,
  },
  card: {
    width: "100%",
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 10,
  },
  cardLead: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "500",
  },
  benefits: {
    width: "100%",
    gap: 12,
  },
  sectionLabel: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "500",
    marginBottom: 4,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  benefitMark: {
    fontSize: 22,
    lineHeight: 22,
    marginTop: 1,
  },
  benefitText: {
    flex: 1,
  },
  actions: {
    width: "100%",
    gap: 14,
  },
  primaryBtn: {
    minHeight: 44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    marginTop: 4,
  },
  secondaryBtn: {
    minHeight: 44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  btnLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
    textAlign: "center",
  },
  walletHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  orText: {
    fontSize: 13,
    lineHeight: 16,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  signInHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  status: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 4,
  },
});

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../api/_base";
import { useAppStrings } from "../../locales/AppStringsContext";
import { layout, typographyRect15, useColors } from "../theme";
import { useTelegramMessagesConnection } from "../telegram/TelegramMessagesConnectionContext";
import { logTelegramConnect } from "../telegram/telegramConnectDebug";

function useQrDataUrl(link: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !link) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const QRCode = await import("qrcode");
        const url = await QRCode.toDataURL(link, { margin: 1, width: 220 });
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [link]);

  return dataUrl;
}

function isLocalDevApiBase(): boolean {
  try {
    const base = getApiBaseUrl();
    return /localhost|127\.0\.0\.1|192\.168\.|10\./.test(base);
  } catch {
    return false;
  }
}

function connectErrorMessage(error: string | null, t: (key: string) => string): string {
  if (!error) return t("messages.connectError");
  if (error === "tdlib_gateway_url_missing") {
    return t("messages.connectErrorGatewayUrlMissing");
  }
  if (error === "tdlib_gateway_unreachable") {
    return isLocalDevApiBase()
      ? t("messages.connectErrorGatewayLocal")
      : t("messages.connectErrorGatewayProduction");
  }
  if (error === "tdlib_gateway_not_configured" || error === "telegram_api_credentials_missing") {
    return t("messages.connectErrorNotConfigured");
  }
  if (error === "telegram_network_unreachable") {
    return t("messages.connectErrorTelegramNetwork");
  }
  return error;
}

export function TelegramConnectSheet() {
  const colors = useColors();
  const { t } = useAppStrings();
  const {
    connectSheetVisible,
    closeConnectSheet,
    connectPending,
    connectAuthState,
    connectQrLink,
    connectError,
    beginMtprotoConnect,
    submitMtprotoPassword,
  } = useTelegramMessagesConnection();
  const [password, setPassword] = useState("");
  const qrDataUrl = useQrDataUrl(connectQrLink);

  useEffect(() => {
    logTelegramConnect("sheet_visible", { visible: connectSheetVisible, connectAuthState, connectPending });
  }, [connectSheetVisible, connectAuthState, connectPending]);

  useEffect(() => {
    if (!connectSheetVisible) {
      setPassword("");
      return;
    }
    if (connectAuthState === "idle") {
      void beginMtprotoConnect();
    }
  }, [connectSheetVisible, connectAuthState, beginMtprotoConnect]);

  const onRetry = useCallback(() => {
    setPassword("");
    void beginMtprotoConnect();
  }, [beginMtprotoConnect]);

  const onSubmitPassword = useCallback(() => {
    void submitMtprotoPassword(password);
  }, [password, submitMtprotoPassword]);

  const onClose = useCallback(() => {
    logTelegramConnect("sheet_close");
    setPassword("");
    closeConnectSheet();
  }, [closeConnectSheet]);

  const showQr = connectAuthState === "wait_qr" && Boolean(connectQrLink);
  const showPassword = connectAuthState === "wait_password";
  const showLoading =
    connectPending ||
    connectAuthState === "initializing" ||
    (connectAuthState === "wait_qr" && !connectQrLink);

  return (
    <Modal visible={connectSheetVisible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.highlight }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <Text style={[typographyRect15, styles.title, { color: colors.primary }]}>
            {t("messages.connectSheetTitle")}
          </Text>

          {showLoading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[typographyRect15, styles.hint, { color: colors.secondary }]}>
                {t("messages.connectSheetLoading")}
              </Text>
            </View>
          ) : null}

          {showQr ? (
            <View style={styles.centerBlock}>
              {qrDataUrl ? (
                <Image
                  source={{ uri: qrDataUrl }}
                  style={styles.qr}
                  accessibilityLabel={t("messages.connectSheetQrAlt")}
                />
              ) : (
                <Text style={[typographyRect15, { color: colors.secondary }]} selectable>
                  {connectQrLink}
                </Text>
              )}
              <Text style={[typographyRect15, styles.body, { color: colors.secondary }]}>
                {t("messages.connectSheetQrBody")}
              </Text>
            </View>
          ) : null}

          {showPassword ? (
            <View style={styles.passwordBlock}>
              <Text style={[typographyRect15, styles.title, { color: colors.primary, marginBottom: 8 }]}>
                {t("messages.connectSheetPasswordTitle")}
              </Text>
              <Text style={[typographyRect15, styles.body, { color: colors.secondary }]}>
                {t("messages.connectSheetPasswordBody")}
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder={t("messages.connectSheetPasswordPlaceholder")}
                placeholderTextColor={colors.secondary}
                style={[
                  typographyRect15,
                  styles.passwordInput,
                  { color: colors.primary, borderColor: colors.highlight },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                accessibilityRole="button"
                onPress={onSubmitPassword}
                style={[styles.button, styles.primaryButton, { backgroundColor: colors.undercover }]}
                disabled={connectPending || !password.trim()}
              >
                {connectPending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[typographyRect15, { color: colors.primary }]}>
                    {t("messages.connectSheetPasswordSubmit")}
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {showPassword && connectError ? (
            <Text style={[typographyRect15, styles.error, { color: "#b00020" }]}>
              {connectErrorMessage(connectError, t)}
            </Text>
          ) : null}

          {connectAuthState === "failed" || (connectError && !showPassword) ? (
            <Text style={[typographyRect15, styles.error, { color: "#b00020" }]}>
              {connectErrorMessage(connectError, t)}
            </Text>
          ) : null}

          {!showPassword && connectAuthState !== "wait_qr" && !showLoading ? (
            <Text style={[typographyRect15, styles.body, { color: colors.secondary }]}>
              {t("messages.connectSheetBody")}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.button, { backgroundColor: colors.undercover }]}
              disabled={connectPending && connectAuthState !== "wait_qr"}
            >
              <Text style={[typographyRect15, { color: colors.secondary }]}>{t("common.back")}</Text>
            </Pressable>
            {connectAuthState === "failed" ? (
              <Pressable
                accessibilityRole="button"
                onPress={onRetry}
                style={[styles.button, styles.primaryButton, { backgroundColor: colors.undercover }]}
                disabled={connectPending}
              >
                <Text style={[typographyRect15, { color: colors.primary }]}>{t("messages.connectRetry")}</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: layout.contentSideInsetPx,
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...Platform.select({
      web: { boxSizing: "border-box" as const },
      default: {},
    }),
  },
  title: {
    marginBottom: 10,
  },
  body: {
    marginBottom: 12,
    textAlign: "center",
  },
  hint: {
    marginTop: 12,
    textAlign: "center",
  },
  centerBlock: {
    alignItems: "center",
    marginBottom: 12,
  },
  qr: {
    width: 220,
    height: 220,
    marginBottom: 12,
    borderRadius: 8,
  },
  passwordBlock: {
    marginBottom: 12,
    gap: 10,
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    minHeight: 40,
  },
  error: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 8,
  },
  button: {
    minHeight: 40,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    minWidth: 100,
  },
});

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../api/_base";
import { useAppStrings } from "../../locales/AppStringsContext";
import { typographyRect15, useColors } from "../theme";
import { useTelegramMessagesConnection } from "../telegram/TelegramMessagesConnectionContext";
import { logTelegramConnect } from "../telegram/telegramConnectDebug";
import { AppModalSheet, AppModalSheetBackFooter, appModalSheetStyles } from "./AppModalSheet";

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
  if (error === "password_rejected" || /PASSWORD_HASH_INVALID|password/i.test(error)) {
    return t("messages.connectErrorPasswordRejected");
  }
  if (error === "gateway_timeout_retry" || error === "HTTP_504") {
    return t("messages.connectErrorGatewayTimeout");
  }
  if (error === "network_error" || error === "Failed to fetch") {
    return t("messages.connectErrorNetwork");
  }
  if (
    error === "session_expired_restart" ||
    error === "authorization_closed" ||
    error === "Not Found"
  ) {
    return t("messages.connectErrorSessionExpired");
  }
  if (error === "attempt_id_and_password_required") {
    return t("messages.connectErrorPasswordRequest");
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
    void beginMtprotoConnect({ fresh: true });
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
    <AppModalSheet
      visible={connectSheetVisible}
      onClose={onClose}
      title={t("messages.connectSheetTitle")}
      footer={
        <AppModalSheetBackFooter
          onClose={onClose}
          label={t("common.back")}
          disabled={connectPending && connectAuthState !== "wait_qr"}
          extraActions={
            connectAuthState === "failed" ? (
              <Pressable
                accessibilityRole="button"
                onPress={onRetry}
                style={[
                  appModalSheetStyles.button,
                  appModalSheetStyles.primaryButton,
                  { backgroundColor: colors.undercover },
                ]}
                disabled={connectPending}
              >
                <Text style={[typographyRect15, { color: colors.primary }]}>
                  {t("messages.connectRetry")}
                </Text>
              </Pressable>
            ) : null
          }
        />
      }
    >
      {showLoading ? (
        <View style={appModalSheetStyles.centerBlock}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[typographyRect15, appModalSheetStyles.hint, { color: colors.secondary }]}>
            {t("messages.connectSheetLoading")}
          </Text>
        </View>
      ) : null}

      {showQr ? (
        <View style={appModalSheetStyles.centerBlock}>
          {qrDataUrl ? (
            <Image
              source={{ uri: qrDataUrl }}
              style={appModalSheetStyles.qr}
              accessibilityLabel={t("messages.connectSheetQrAlt")}
            />
          ) : (
            <Text style={[typographyRect15, { color: colors.secondary }]} selectable>
              {connectQrLink}
            </Text>
          )}
          <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary }]}>
            {t("messages.connectSheetQrBody")}
          </Text>
        </View>
      ) : null}

      {showPassword ? (
        <View style={appModalSheetStyles.passwordBlock}>
          <Text
            style={[
              typographyRect15,
              appModalSheetStyles.title,
              { color: colors.primary, marginBottom: 8 },
            ]}
          >
            {t("messages.connectSheetPasswordTitle")}
          </Text>
          <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary }]}>
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
              appModalSheetStyles.passwordInput,
              { color: colors.primary, borderColor: colors.highlight },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            accessibilityRole="button"
            onPress={onSubmitPassword}
            style={[
              appModalSheetStyles.button,
              appModalSheetStyles.primaryButton,
              { backgroundColor: colors.undercover },
            ]}
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
        <Text style={[typographyRect15, appModalSheetStyles.error, { color: "#b00020" }]}>
          {connectErrorMessage(connectError, t)}
        </Text>
      ) : null}

      {connectAuthState === "failed" || (connectError && !showPassword) ? (
        <Text style={[typographyRect15, appModalSheetStyles.error, { color: "#b00020" }]}>
          {connectErrorMessage(connectError, t)}
        </Text>
      ) : null}

      {!showPassword && connectAuthState !== "wait_qr" && !showLoading ? (
        <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary }]}>
          {t("messages.connectSheetBody")}
        </Text>
      ) : null}
    </AppModalSheet>
  );
}

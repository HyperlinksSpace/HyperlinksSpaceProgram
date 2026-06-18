import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../api/_base";
import { useAppStrings } from "../../locales/AppStringsContext";
import { typographyRect15, useColors } from "../theme";
import { openTelegramDeepLink } from "../telegram/openTelegramDeepLink";
import { useTelegramMessagesConnection } from "../telegram/TelegramMessagesConnectionContext";
import { preferPhoneMtprotoConnect } from "../telegram/preferPhoneMtprotoConnect";
import { isCloudMtprotoGateway } from "../telegram/mtprotoGatewayMode";
import { formatConnectCodeDeliveryHint } from "../telegram/formatConnectCodeDelivery";
import { logTelegramConnect } from "../telegram/telegramConnectDebug";
import { isActuallyInTelegram } from "./telegramWebApp";
import { AppModalSheet, AppModalSheetBackFooter, appModalSheetStyles } from "./AppModalSheet";
import { WelcomeAuthFormField } from "./WelcomeAuthFormField";

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
  if (error === "invalid_phone_number") {
    return t("messages.connectErrorInvalidPhone");
  }
  if (error === "code_rejected" || /PHONE_CODE_INVALID|code/i.test(error)) {
    return t("messages.connectErrorCodeRejected");
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
  if (
    error === "not_found" ||
    error === "attempt_not_found" ||
    error === "session_not_ready"
  ) {
    return t("messages.connectErrorGatewayPhoneEndpoint");
  }
  return error;
}

export function TelegramConnectSheet() {
  const colors = useColors();
  const { t, tf } = useAppStrings();
  const {
    connectSheetVisible,
    closeConnectSheet,
    connectPending,
    connectAuthState,
    connectAuthMethod,
    connectQrLink,
    connectError,
    connectCodeDelivery,
    beginMtprotoConnect,
    submitMtprotoPhone,
    submitMtprotoCode,
    resendMtprotoCode,
    submitMtprotoPassword,
    switchToQrConnect,
  } = useTelegramMessagesConnection();
  const inTelegramApp = isActuallyInTelegram();
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [phoneFlowStarted, setPhoneFlowStarted] = useState(false);
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const qrDataUrl = useQrDataUrl(connectQrLink);

  useEffect(() => {
    logTelegramConnect("sheet_visible", { visible: connectSheetVisible, connectAuthState, connectPending });
  }, [connectSheetVisible, connectAuthState, connectPending]);

  useEffect(() => {
    if (!connectSheetVisible) {
      setPassword("");
      setPhoneNumber("");
      setLoginCode("");
      setPhoneInvalid(false);
      setPhoneFlowStarted(false);
      return;
    }
    if (connectAuthState === "idle") {
      const authMethod = preferPhoneMtprotoConnect() ? "phone" : "qr";
      void beginMtprotoConnect({ authMethod });
    }
  }, [connectSheetVisible, connectAuthState, beginMtprotoConnect]);

  const onRetry = useCallback(() => {
    setPassword("");
    setPhoneNumber("");
    setLoginCode("");
    setPhoneInvalid(false);
    setPhoneFlowStarted(false);
    void beginMtprotoConnect({ fresh: true, authMethod: "qr" });
  }, [beginMtprotoConnect]);

  const onSubmitPassword = useCallback(() => {
    void submitMtprotoPassword(password);
  }, [password, submitMtprotoPassword]);

  const onSubmitPhone = useCallback(() => {
    const trimmed = phoneNumber.trim();
    if (!trimmed || trimmed.replace(/[^\d+]/g, "").length < 8) {
      setPhoneInvalid(true);
      return;
    }
    setPhoneInvalid(false);
    setPhoneFlowStarted(true);
    void submitMtprotoPhone(trimmed);
  }, [phoneNumber, submitMtprotoPhone]);

  const onResendCode = useCallback(() => {
    void resendMtprotoCode();
  }, [resendMtprotoCode]);

  const onSubmitCode = useCallback(() => {
    void submitMtprotoCode(loginCode);
  }, [loginCode, submitMtprotoCode]);

  const onOpenInTelegram = useCallback(() => {
    if (connectQrLink) openTelegramDeepLink(connectQrLink);
  }, [connectQrLink]);

  const onSwitchToQr = useCallback(() => {
    setPhoneFlowStarted(false);
    setPhoneNumber("");
    setLoginCode("");
    setPhoneInvalid(false);
    void switchToQrConnect();
  }, [switchToQrConnect]);

  const onClose = useCallback(() => {
    logTelegramConnect("sheet_close");
    setPassword("");
    setPhoneNumber("");
    setLoginCode("");
    setPhoneInvalid(false);
    setPhoneFlowStarted(false);
    closeConnectSheet();
  }, [closeConnectSheet]);

  const showCode = connectAuthState === "wait_code";
  const showPassword = connectAuthState === "wait_password";
  const inPhoneFlow =
    phoneFlowStarted ||
    connectAuthMethod === "phone" ||
    connectAuthState === "wait_phone" ||
    connectAuthState === "wait_code" ||
    connectAuthState === "wait_password";
  const showPhoneEntry =
    inPhoneFlow ||
    connectAuthState === "wait_qr";
  const showQrBlock =
    !inPhoneFlow &&
    connectAuthState === "wait_qr" &&
    Boolean(connectQrLink);
  const showLoading =
    !inPhoneFlow &&
    !showCode &&
    !showPassword &&
    (connectAuthState === "initializing" ||
      (connectAuthState === "wait_qr" && !connectQrLink));

  const loadingLabel = inPhoneFlow
    ? t("messages.connectSheetLoadingPhone")
    : t("messages.connectSheetLoading");

  const phoneErrorText =
    phoneInvalid || connectError === "invalid_phone_number"
      ? t("messages.connectErrorInvalidPhone")
      : null;

  const codeDeliveryHint =
    formatConnectCodeDeliveryHint(connectCodeDelivery, tf) ??
    (inTelegramApp ? t("messages.connectSheetCodeBody") : t("messages.connectSheetCodeBodyDesktop"));

  const canResendCode =
    connectCodeDelivery?.type !== "authenticationCodeTypeTelegramMessage" ||
    Boolean(connectCodeDelivery?.nextType);

  const cloudGateway = isCloudMtprotoGateway();

  return (
    <AppModalSheet
      visible={connectSheetVisible}
      onClose={onClose}
      title={t("messages.connectSheetTitle")}
      footer={
        <AppModalSheetBackFooter
          onClose={onClose}
          label={t("common.back")}
          disabled={connectPending && connectAuthState !== "wait_qr" && connectAuthState !== "wait_phone"}
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
            {loadingLabel}
          </Text>
        </View>
      ) : null}

      {showQrBlock ? (
        <View style={appModalSheetStyles.centerBlock}>
          <Text
            style={[
              typographyRect15,
              appModalSheetStyles.title,
              { color: colors.primary, marginBottom: 10, textAlign: "center" },
            ]}
          >
            {t("messages.connectSheetScanQr")}
          </Text>
          <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary, marginBottom: 8, textAlign: "center" }]}>
            {t("messages.connectSheetQrBody")}
          </Text>
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
          {!inTelegramApp ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenInTelegram}
              style={[
                appModalSheetStyles.button,
                appModalSheetStyles.primaryButton,
                { backgroundColor: colors.undercover, marginTop: 4 },
              ]}
            >
              <Text style={[typographyRect15, { color: colors.primary }]}>
                {t("messages.connectSheetOpenInTelegram")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showPhoneEntry && !showCode ? (
        <View style={{ marginTop: showQrBlock ? 12 : 0, width: "100%" }}>
          {cloudGateway && !showQrBlock ? (
            <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary, marginBottom: 8 }]}>
              {t("messages.connectSheetPhoneCloudWarning")}
            </Text>
          ) : inTelegramApp && !showQrBlock ? (
            <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary, marginBottom: 8 }]}>
              {t("messages.connectSheetPhoneMobileHint")}
            </Text>
          ) : null}
          <WelcomeAuthFormField
            label={
              showQrBlock
                ? t("messages.connectSheetOrPhone")
                : t("messages.connectSheetPhoneTitle")
            }
          value={phoneNumber}
          onChangeText={(next) => {
            setPhoneNumber(next);
            if (phoneInvalid) setPhoneInvalid(false);
          }}
          placeholder={t("messages.connectSheetPhonePlaceholder")}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          inputId="telegram-connect-phone-input"
          errorText={phoneErrorText}
          submitLabel={t("messages.connectSheetPhoneSubmit")}
          onSubmit={onSubmitPhone}
          submitDisabled={!phoneNumber.trim()}
          submitting={connectPending && (connectAuthState === "wait_phone" || connectAuthState === "wait_qr")}
        />
        {inPhoneFlow && !showQrBlock ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSwitchToQr}
            style={[appModalSheetStyles.button, { marginTop: 8, alignSelf: "center" }]}
            disabled={connectPending}
          >
            <Text style={[typographyRect15, { color: colors.primary }]}>
              {t("messages.connectSheetUseQrInstead")}
            </Text>
          </Pressable>
        ) : null}
        </View>
      ) : null}

      {showCode ? (
        <View style={appModalSheetStyles.passwordBlock}>
          <Text
            style={[
              typographyRect15,
              appModalSheetStyles.title,
              { color: colors.primary, marginBottom: 4, textAlign: "center" },
            ]}
          >
            {t("messages.connectSheetCodeTitle")}
          </Text>
          <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary, marginBottom: 4 }]}>
            {codeDeliveryHint}
          </Text>
          <WelcomeAuthFormField
            value={loginCode}
            onChangeText={setLoginCode}
            placeholder={t("messages.connectSheetCodePlaceholder")}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            inputId="telegram-connect-code-input"
            errorText={
              connectError && /code|PHONE_CODE/i.test(connectError)
                ? connectErrorMessage(connectError, t)
                : null
            }
            submitLabel={t("messages.connectSheetCodeSubmit")}
            onSubmit={onSubmitCode}
            submitDisabled={!loginCode.trim()}
            submitting={connectPending}
          />
          {canResendCode ? (
            <Pressable
              accessibilityRole="button"
              onPress={onResendCode}
              style={[appModalSheetStyles.button, { marginTop: 8, alignSelf: "center" }]}
              disabled={connectPending}
            >
              <Text style={[typographyRect15, { color: colors.primary }]}>
                {t("messages.connectSheetCodeResend")}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onSwitchToQr}
            style={[appModalSheetStyles.button, { marginTop: 8, alignSelf: "center" }]}
            disabled={connectPending}
          >
            <Text style={[typographyRect15, { color: colors.primary }]}>
              {t("messages.connectSheetUseQrInstead")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {showPassword ? (
        <View style={appModalSheetStyles.passwordBlock}>
          <Text
            style={[
              typographyRect15,
              appModalSheetStyles.title,
              { color: colors.primary, marginBottom: 4, textAlign: "center" },
            ]}
          >
            {t("messages.connectSheetPasswordTitle")}
          </Text>
          <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary, marginBottom: 4 }]}>
            {t("messages.connectSheetPasswordBody")}
          </Text>
          <WelcomeAuthFormField
            value={password}
            onChangeText={setPassword}
            placeholder={t("messages.connectSheetPasswordPlaceholder")}
            secureTextEntry
            inputId="telegram-connect-password-input"
            errorText={
              connectError && /password|PASSWORD/i.test(connectError)
                ? connectErrorMessage(connectError, t)
                : null
            }
            submitLabel={t("messages.connectSheetPasswordSubmit")}
            onSubmit={onSubmitPassword}
            submitDisabled={!password.trim()}
            submitting={connectPending}
          />
        </View>
      ) : null}

      {showPhoneEntry && connectError && connectError !== "invalid_phone_number" && !showCode && !showPassword ? (
        <Text style={[typographyRect15, appModalSheetStyles.error, { color: "#b00020" }]}>
          {connectErrorMessage(connectError, t)}
        </Text>
      ) : null}

      {connectAuthState === "failed" || (connectError && !showPassword && !showCode && !showPhoneEntry) ? (
        <Text style={[typographyRect15, appModalSheetStyles.error, { color: "#b00020" }]}>
          {connectErrorMessage(connectError, t)}
        </Text>
      ) : null}
    </AppModalSheet>
  );
}

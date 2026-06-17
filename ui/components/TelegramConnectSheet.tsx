import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../api/_base";
import { useAppStrings } from "../../locales/AppStringsContext";
import { typographyRect15, useColors } from "../theme";
import { openTelegramDeepLink } from "../telegram/openTelegramDeepLink";
import {
  type MtprotoAuthMethod,
  useTelegramMessagesConnection,
} from "../telegram/TelegramMessagesConnectionContext";
import { logTelegramConnect } from "../telegram/telegramConnectDebug";
import { AppModalSheet, AppModalSheetBackFooter, appModalSheetStyles } from "./AppModalSheet";

const methodTabStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
});

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
  return error;
}

function ConnectMethodTabs({
  method,
  disabled,
  onSelect,
}: {
  method: MtprotoAuthMethod;
  disabled: boolean;
  onSelect: (method: MtprotoAuthMethod) => void;
}) {
  const colors = useColors();
  const { t } = useAppStrings();

  const renderTab = (value: MtprotoAuthMethod, label: string) => {
    const active = method === value;
    return (
      <Pressable
        key={value}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        disabled={disabled}
        onPress={() => onSelect(value)}
        style={[
          methodTabStyles.tab,
          {
            borderColor: active ? colors.accent : colors.highlight,
            backgroundColor: active ? colors.undercover : "transparent",
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        <Text style={[typographyRect15, { color: colors.primary }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={methodTabStyles.row}>
      {renderTab("qr", t("messages.connectSheetMethodQr"))}
      {renderTab("phone", t("messages.connectSheetMethodPhone"))}
    </View>
  );
}

export function TelegramConnectSheet() {
  const colors = useColors();
  const { t } = useAppStrings();
  const {
    connectSheetVisible,
    closeConnectSheet,
    connectPending,
    connectAuthState,
    connectAuthMethod,
    connectQrLink,
    connectError,
    beginMtprotoConnect,
    submitMtprotoPhone,
    submitMtprotoCode,
    submitMtprotoPassword,
  } = useTelegramMessagesConnection();
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const qrDataUrl = useQrDataUrl(connectQrLink);

  useEffect(() => {
    logTelegramConnect("sheet_visible", { visible: connectSheetVisible, connectAuthState, connectPending });
  }, [connectSheetVisible, connectAuthState, connectPending]);

  useEffect(() => {
    if (!connectSheetVisible) {
      setPassword("");
      setPhoneNumber("");
      setLoginCode("");
      return;
    }
    if (connectAuthState === "idle") {
      void beginMtprotoConnect({ authMethod: connectAuthMethod });
    }
  }, [connectSheetVisible, connectAuthState, beginMtprotoConnect, connectAuthMethod]);

  const onSelectMethod = useCallback(
    (method: MtprotoAuthMethod) => {
      if (method === connectAuthMethod) return;
      setPassword("");
      setPhoneNumber("");
      setLoginCode("");
      void beginMtprotoConnect({ fresh: true, authMethod: method });
    },
    [beginMtprotoConnect, connectAuthMethod],
  );

  const onRetry = useCallback(() => {
    setPassword("");
    setPhoneNumber("");
    setLoginCode("");
    void beginMtprotoConnect({ fresh: true, authMethod: connectAuthMethod });
  }, [beginMtprotoConnect, connectAuthMethod]);

  const onSubmitPassword = useCallback(() => {
    void submitMtprotoPassword(password);
  }, [password, submitMtprotoPassword]);

  const onSubmitPhone = useCallback(() => {
    void submitMtprotoPhone(phoneNumber);
  }, [phoneNumber, submitMtprotoPhone]);

  const onSubmitCode = useCallback(() => {
    void submitMtprotoCode(loginCode);
  }, [loginCode, submitMtprotoCode]);

  const onOpenInTelegram = useCallback(() => {
    if (connectQrLink) openTelegramDeepLink(connectQrLink);
  }, [connectQrLink]);

  const onClose = useCallback(() => {
    logTelegramConnect("sheet_close");
    setPassword("");
    setPhoneNumber("");
    setLoginCode("");
    closeConnectSheet();
  }, [closeConnectSheet]);

  const showMethodTabs =
    connectAuthState !== "wait_password" && connectAuthState !== "ready";
  const showQr = connectAuthMethod === "qr" && connectAuthState === "wait_qr" && Boolean(connectQrLink);
  const showPhone =
    connectAuthMethod === "phone" &&
    (connectAuthState === "wait_phone" || connectAuthState === "wait_code");
  const showPassword = connectAuthState === "wait_password";
  const showLoading =
    connectAuthState === "initializing" ||
    (connectAuthMethod === "qr" && connectAuthState === "wait_qr" && !connectQrLink);

  const loadingLabel =
    connectAuthMethod === "phone"
      ? t("messages.connectSheetLoadingPhone")
      : t("messages.connectSheetLoading");

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
      {showMethodTabs ? (
        <ConnectMethodTabs
          method={connectAuthMethod}
          disabled={connectPending && connectAuthState !== "wait_phone" && connectAuthState !== "wait_code"}
          onSelect={onSelectMethod}
        />
      ) : null}

      {showLoading ? (
        <View style={appModalSheetStyles.centerBlock}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[typographyRect15, appModalSheetStyles.hint, { color: colors.secondary }]}>
            {loadingLabel}
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
        </View>
      ) : null}

      {showPhone && connectAuthState === "wait_phone" ? (
        <View style={appModalSheetStyles.passwordBlock}>
          <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary }]}>
            {t("messages.connectSheetPhoneBody")}
          </Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder={t("messages.connectSheetPhonePlaceholder")}
            placeholderTextColor={colors.secondary}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
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
            onPress={onSubmitPhone}
            style={[
              appModalSheetStyles.button,
              appModalSheetStyles.primaryButton,
              { backgroundColor: colors.undercover },
            ]}
            disabled={connectPending || !phoneNumber.trim()}
          >
            {connectPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[typographyRect15, { color: colors.primary }]}>
                {t("messages.connectSheetPhoneSubmit")}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {showPhone && connectAuthState === "wait_code" ? (
        <View style={appModalSheetStyles.passwordBlock}>
          <Text
            style={[
              typographyRect15,
              appModalSheetStyles.title,
              { color: colors.primary, marginBottom: 8 },
            ]}
          >
            {t("messages.connectSheetCodeTitle")}
          </Text>
          <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary }]}>
            {t("messages.connectSheetCodeBody")}
          </Text>
          <TextInput
            value={loginCode}
            onChangeText={setLoginCode}
            placeholder={t("messages.connectSheetCodePlaceholder")}
            placeholderTextColor={colors.secondary}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
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
            onPress={onSubmitCode}
            style={[
              appModalSheetStyles.button,
              appModalSheetStyles.primaryButton,
              { backgroundColor: colors.undercover },
            ]}
            disabled={connectPending || !loginCode.trim()}
          >
            {connectPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[typographyRect15, { color: colors.primary }]}>
                {t("messages.connectSheetCodeSubmit")}
              </Text>
            )}
          </Pressable>
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

      {(showPassword || showPhone) && connectError ? (
        <Text style={[typographyRect15, appModalSheetStyles.error, { color: "#b00020" }]}>
          {connectErrorMessage(connectError, t)}
        </Text>
      ) : null}

      {connectAuthState === "failed" || (connectError && !showPassword && !showPhone) ? (
        <Text style={[typographyRect15, appModalSheetStyles.error, { color: "#b00020" }]}>
          {connectErrorMessage(connectError, t)}
        </Text>
      ) : null}

      {!showPassword &&
      !showPhone &&
      connectAuthState !== "wait_qr" &&
      !showLoading &&
      connectAuthState !== "failed" ? (
        <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary }]}>
          {t("messages.connectSheetBody")}
        </Text>
      ) : null}
    </AppModalSheet>
  );
}

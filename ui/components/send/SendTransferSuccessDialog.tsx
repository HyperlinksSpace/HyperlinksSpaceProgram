import { Platform, Pressable, Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { formatLocaleDllrBalance } from "../../format/localeAmountFormat";
import { FONT_UI_SANS_REGULAR, FONT_UI_SANS_SEMIBOLD, WEB_UI_SANS_STACK } from "../../fonts";
import { useColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { AppModalSheet } from "../AppModalSheet";
import { HYPERLINKS_SPACE_LOGO_GREEN } from "../HyperlinksSpaceLogo";
import { walletAddressHeaderSnippet } from "../../wallet/walletAddressFormat";

export type SendTransferSuccessDetails = {
  amountUsd: number;
  toAddress: string;
  recipientBalanceUsd: number;
  comment?: string;
};

type Props = {
  visible: boolean;
  details: SendTransferSuccessDetails | null;
  onClose: () => void;
};

/**
 * Success sheet after a built-in DLLR ledger transfer.
 */
export function SendTransferSuccessDialog({ visible, details, onClose }: Props) {
  const colors = useColors();
  const { colorScheme } = useTelegram();
  const lightTheme = colorScheme === "light";
  const { t, tf, locale } = useAppStrings();
  const labelFont = Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR;
  const titleFont = Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_SEMIBOLD;
  const green = HYPERLINKS_SPACE_LOGO_GREEN;

  if (!visible || !details) return null;

  const toSnippet = walletAddressHeaderSnippet(details.toAddress) || details.toAddress;

  return (
    <AppModalSheet
      visible
      onClose={onClose}
      title={t("send.success.title")}
      fitContentHeight
      sizeStorageKey="hsp.sendTransferSuccess.size.v1"
      offsetStorageKey="hsp.sendTransferSuccess.offset.v1"
    >
      <View style={{ alignItems: "center", gap: 14, paddingBottom: 4 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: lightTheme ? "rgba(0,200,80,0.14)" : "rgba(0,224,90,0.18)",
            borderWidth: 1.5,
            borderColor: green,
            ...(Platform.OS === "web"
              ? ({
                  boxShadow: lightTheme
                    ? `0 0 0 4px rgba(0,200,80,0.08), 0 8px 24px rgba(0,120,40,0.18)`
                    : `0 0 0 4px rgba(0,224,90,0.12), 0 10px 28px rgba(0,224,90,0.22)`,
                } as object)
              : null),
          }}
        >
          <Text
            style={{
              color: green,
              fontSize: 34,
              lineHeight: 38,
              fontWeight: "700",
              fontFamily: titleFont,
            }}
          >
            ✓
          </Text>
        </View>

        <Text
          style={{
            color: colors.secondary,
            fontSize: 14,
            lineHeight: 20,
            textAlign: "center",
            fontFamily: labelFont,
          }}
        >
          {tf("send.success.body", {
            amount: formatLocaleDllrBalance(details.amountUsd, locale),
            address: toSnippet,
          })}
        </Text>

        <View
          style={{
            alignSelf: "stretch",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: colors.undercover,
            borderWidth: 1,
            borderColor: green,
          }}
        >
          <Text
            style={{
              color: green,
              fontSize: 13,
              lineHeight: 18,
              textAlign: "center",
              fontFamily: labelFont,
              fontWeight: "600",
            }}
          >
            {tf("send.success.recipientBalance", {
              balance: formatLocaleDllrBalance(details.recipientBalanceUsd, locale),
            })}
          </Text>
          {details.comment ? (
            <Text
              style={{
                color: colors.secondary,
                fontSize: 12,
                lineHeight: 16,
                textAlign: "center",
                fontFamily: labelFont,
              }}
            >
              {tf("send.success.comment", { comment: details.comment })}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => ({
            marginTop: 4,
            alignSelf: "stretch",
            paddingHorizontal: 22,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: green,
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 15,
              fontWeight: "700",
              textAlign: "center",
              fontFamily: titleFont,
            }}
          >
            {t("send.success.done")}
          </Text>
        </Pressable>
      </View>
    </AppModalSheet>
  );
}

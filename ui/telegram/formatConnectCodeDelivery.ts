export type ConnectCodeDeliveryInfo = {
  type: string;
  nextType?: string | null;
  timeoutSec?: number | null;
  phoneMasked?: string | null;
};

type AppStringFn = (key: string, vars?: Record<string, string | number | boolean>) => string;

export function formatConnectCodeDeliveryHint(
  delivery: ConnectCodeDeliveryInfo | null | undefined,
  tf: AppStringFn,
): string | null {
  if (!delivery?.type) return null;
  const phone = delivery.phoneMasked ?? tf("messages.connectSheetCodePhoneUnknown");

  if (delivery.type === "authenticationCodeTypeTelegramMessage") {
    return tf("messages.connectSheetCodeSentTelegram", { phone });
  }
  if (delivery.type === "authenticationCodeTypeSms") {
    return tf("messages.connectSheetCodeSentSms", { phone });
  }
  if (delivery.type === "authenticationCodeTypeCall" || delivery.type === "authenticationCodeTypeFlashCall") {
    return tf("messages.connectSheetCodeSentCall", { phone });
  }
  return tf("messages.connectSheetCodeSentGeneric", { phone });
}

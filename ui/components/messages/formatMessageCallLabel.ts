export function formatMessageCallLabel(
  isOutgoing: boolean,
  t: (key: string) => string,
): string {
  return isOutgoing ? t("messages.call.outgoing") : t("messages.call.incoming");
}

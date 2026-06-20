import { useAppStrings } from "../../../locales/AppStringsContext";
import { GlobalBottomBar } from "../GlobalBottomBar";

/** Chat compose bar in wide three-column layout — same chrome as {@link GlobalBottomBar}. */
export function MessageChatWriteBottomBar() {
  const { t } = useAppStrings();
  return (
    <GlobalBottomBar
      placeholderText={t("messages.chatWrite.placeholder")}
      iconRotationDeg={-45}
      sendAccessibilityLabel={t("messages.chatWrite.send")}
      useLocalDraft
      onSubmit={() => {}}
    />
  );
}

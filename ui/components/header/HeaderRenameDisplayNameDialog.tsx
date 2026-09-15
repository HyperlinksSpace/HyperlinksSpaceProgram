import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { requestUpdateDisplayName } from "../../profile/requestUpdateDisplayName";
import { typographyRect15, useColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { AppModalSheet } from "../AppModalSheet";

type Props = {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onSaved: (name: string) => void;
};

/** Rename the public profile name shown next to the wallet address. */
export function HeaderRenameDisplayNameDialog({
  visible,
  initialName,
  onClose,
  onSaved,
}: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const { initData } = useTelegram();
  const [value, setValue] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setValue(initialName);
    setError(null);
    setBusy(false);
  }, [visible, initialName]);

  const submit = useCallback(async () => {
    const next = value.trim().replace(/\s+/g, " ");
    if (!next) {
      setError(t("home.header.renameEmpty"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestUpdateDisplayName({
      displayName: next,
      initDataRaw: initData,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "display_name_too_long"
          ? t("home.header.renameTooLong")
          : t("home.header.renameFailed"),
      );
      return;
    }
    onSaved(result.displayName);
    onClose();
  }, [value, initData, t, onSaved, onClose]);

  if (!visible) return null;

  const labelFont = Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR;

  return (
    <AppModalSheet
      visible
      onClose={busy ? () => {} : onClose}
      title={t("home.header.renameTitle")}
      fitContentHeight
      sizeStorageKey="hsp.headerRenameName.size.v1"
      offsetStorageKey="hsp.headerRenameName.offset.v1"
    >
      <View style={{ gap: 14 }}>
        <Text
          style={{
            color: colors.secondary,
            fontSize: 14,
            lineHeight: 20,
            fontFamily: labelFont,
          }}
        >
          {t("home.header.renameSubtitle")}
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          autoFocus
          editable={!busy}
          maxLength={64}
          placeholder={t("home.header.renamePlaceholder")}
          placeholderTextColor={colors.secondary}
          onSubmitEditing={() => void submit()}
          style={{
            borderWidth: 1,
            borderColor: colors.highlight,
            backgroundColor: colors.undercover,
            color: colors.primary,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
            fontFamily: labelFont,
          }}
        />
        {error ? (
          <Text style={{ color: colors.primary, fontSize: 13, fontFamily: labelFont }}>
            {error}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 20 }}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} hitSlop={8}>
            <Text style={[typographyRect15, { color: colors.secondary }]}>
              {t("common.cancel")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void submit()}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            <Text style={[typographyRect15, { color: colors.primary }]}>
              {t("common.save")}
            </Text>
          </Pressable>
        </View>
      </View>
    </AppModalSheet>
  );
}

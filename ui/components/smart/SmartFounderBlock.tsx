import { Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { typographyRect15, useColors } from "../../theme";
import { SmartFormCapsLabel } from "./SmartFormCapsLabel";
import { englishFounderOrdinalSuffix, type FounderFieldState } from "./smartFounderUtils";
import { SmartUndercoverTextField } from "./SmartUndercoverTextField";

const ORDINAL_TO_CAPS_LABEL_GAP_PX = 30;
const CAPS_LABEL_TO_INPUT_GAP_PX = 20;
const FIELD_SECTION_GAP_PX = 30;

type Props = {
  index: number;
  field: FounderFieldState;
  onChange: (patch: Partial<FounderFieldState>) => void;
};

/** One founder row: ordinal, name, wallet, and share fields. */
export function SmartFounderBlock({ index, field, onChange }: Props) {
  const colors = useColors();
  const { t, tf } = useAppStrings();
  const founderNumber = index + 1;
  const ordinalLabel = tf("smart.company.founderOrdinal", {
    n: founderNumber,
    suffix: englishFounderOrdinalSuffix(founderNumber),
  });

  return (
    <View>
      <Text
        style={[
          typographyRect15,
          {
            fontSize: 15,
            lineHeight: 18,
            fontWeight: "300",
            fontStyle: "italic",
            color: colors.primary,
          },
        ]}
      >
        {ordinalLabel}
      </Text>

      <View style={{ height: ORDINAL_TO_CAPS_LABEL_GAP_PX }} />

      <SmartFormCapsLabel color={colors.primary}>{t("smart.company.founderNameLabel")}</SmartFormCapsLabel>

      <View style={{ height: CAPS_LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverTextField
        nativeID={`smart-company-founder-${index}-name`}
        value={field.name}
        onChangeText={(name) => onChange({ name })}
        placeholder={field.namePlaceholder}
        autoCapitalize="words"
      />

      <View style={{ height: FIELD_SECTION_GAP_PX }} />

      <SmartFormCapsLabel color={colors.primary}>{t("smart.company.founderWalletLabel")}</SmartFormCapsLabel>

      <View style={{ height: CAPS_LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverTextField
        nativeID={`smart-company-founder-${index}-wallet`}
        value={field.wallet}
        onChangeText={(wallet) => onChange({ wallet })}
        placeholder={t("smart.company.founderWalletPlaceholder")}
      />

      <View style={{ height: FIELD_SECTION_GAP_PX }} />

      <SmartFormCapsLabel color={colors.primary}>{t("smart.company.founderShareLabel")}</SmartFormCapsLabel>

      <View style={{ height: CAPS_LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverTextField
        nativeID={`smart-company-founder-${index}-share`}
        value={field.share}
        onChangeText={(share) => onChange({ share })}
      />
    </View>
  );
}

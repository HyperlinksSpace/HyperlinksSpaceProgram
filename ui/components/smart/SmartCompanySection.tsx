import { useState } from "react";
import { Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { typographyRect15, useColors } from "../../theme";
import { SmartUndercoverMultilineField } from "./SmartUndercoverMultilineField";
import { SmartUndercoverTextField } from "./SmartUndercoverTextField";

const VERSION_TO_TITLE_GAP_PX = 30;
const LABEL_TO_INPUT_GAP_PX = 10;
const TITLE_TO_TEXT_SECTION_GAP_PX = 20;

const SECTION_LABEL_FONT_SIZE_PX = 25;
const SECTION_LABEL_LINE_HEIGHT_PX = 40;

const SMART_COMPANY_TITLE_INPUT_ID = "smart-company-title-input";
const SMART_COMPANY_TEXT_INPUT_ID = "smart-company-text-input";

const sectionLabelStyle = (color: string) => [
  typographyRect15,
  {
    fontSize: SECTION_LABEL_FONT_SIZE_PX,
    lineHeight: SECTION_LABEL_LINE_HEIGHT_PX,
    fontWeight: "400" as const,
    color,
  },
];

/** Company purpose fields below the deal version row. */
export function SmartCompanySection() {
  const colors = useColors();
  const { t } = useAppStrings();
  const [title, setTitle] = useState(() => t("smart.company.titleDefault"));
  const [bodyText, setBodyText] = useState("");

  return (
    <>
      <View style={{ height: VERSION_TO_TITLE_GAP_PX }} />

      <Text style={sectionLabelStyle(colors.primary)}>{t("smart.company.titleLabel")}</Text>

      <View style={{ height: LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverTextField
        nativeID={SMART_COMPANY_TITLE_INPUT_ID}
        value={title}
        onChangeText={setTitle}
      />

      <View style={{ height: TITLE_TO_TEXT_SECTION_GAP_PX }} />

      <Text style={sectionLabelStyle(colors.primary)}>{t("smart.company.textLabel")}</Text>

      <View style={{ height: LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverMultilineField
        nativeID={SMART_COMPANY_TEXT_INPUT_ID}
        value={bodyText}
        onChangeText={setBodyText}
        placeholder={t("smart.company.textPlaceholder")}
      />
    </>
  );
}

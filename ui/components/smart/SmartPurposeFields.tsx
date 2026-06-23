import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { typographyRect15, useColors } from "../../theme";
import { SmartUndercoverMultilineField } from "./SmartUndercoverMultilineField";
import { SmartUndercoverTextField } from "./SmartUndercoverTextField";

const VERSION_TO_TITLE_GAP_PX = 30;
const LABEL_TO_INPUT_GAP_PX = 10;

const SECTION_LABEL_FONT_SIZE_PX = 25;
const SECTION_LABEL_LINE_HEIGHT_PX = 40;

const sectionLabelStyle = (color: string) => [
  typographyRect15,
  {
    fontSize: SECTION_LABEL_FONT_SIZE_PX,
    lineHeight: SECTION_LABEL_LINE_HEIGHT_PX,
    fontWeight: "400" as const,
    color,
  },
];

type Props = {
  purposeKey: string; // e.g. "agreement", "investment"
};

export function SmartPurposeFields({ purposeKey }: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const base = `smart.${purposeKey}`;

  const [title, setTitle] = useState(() => {
    const explicit = t(`${base}.titleDefault`);
    // If the translation is missing, `t` may return the key string — fall back to deal version label.
    if (typeof explicit === "string" && explicit.includes(`${base}`)) {
      return t(`smart.dealVersion.${purposeKey}`) || explicit;
    }
    return explicit;
  });
  const [bodyText, setBodyText] = useState("");

  const titleLabel = t(`${base}.titleLabel`) || t("smart.company.titleLabel");
  const textLabel = t(`${base}.textLabel`) || t("smart.company.textLabel");
  const textPlaceholder = t(`${base}.textPlaceholder`) || t("smart.company.textPlaceholder");

  const onChangeTitle = useCallback((s: string) => setTitle(s), []);
  const onChangeText = useCallback((s: string) => setBodyText(s), []);

  return (
    <>
      <View style={{ height: VERSION_TO_TITLE_GAP_PX }} />

      <Text style={sectionLabelStyle(colors.primary)}>{titleLabel}</Text>

      <View style={{ height: LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverTextField
        nativeID={`smart-${purposeKey}-title-input`}
        value={title}
        onChangeText={onChangeTitle}
      />

      <View style={{ height: LABEL_TO_INPUT_GAP_PX }} />

      <Text style={sectionLabelStyle(colors.primary)}>{textLabel}</Text>

      <View style={{ height: LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverMultilineField
        nativeID={`smart-${purposeKey}-text-input`}
        value={bodyText}
        onChangeText={onChangeText}
        placeholder={textPlaceholder}
      />
    </>
  );
}

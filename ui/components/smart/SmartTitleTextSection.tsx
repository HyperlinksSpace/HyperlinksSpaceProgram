import { Text, View } from "react-native";

import { typographyRect15, useColors } from "../../theme";
import { SmartUndercoverMultilineField } from "./SmartUndercoverMultilineField";
import { SmartUndercoverTextField } from "./SmartUndercoverTextField";

const VERSION_TO_TITLE_GAP_PX = 30;
const LABEL_TO_INPUT_GAP_PX = 10;
const TITLE_TO_TEXT_SECTION_GAP_PX = 20;

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
  title: string;
  text: string;
  titleLabel: string;
  textLabel: string;
  textPlaceholder: string;
  titleInputId: string;
  textInputId: string;
  onChangeTitle: (value: string) => void;
  onChangeText: (value: string) => void;
};

export function SmartTitleTextSection({
  title,
  text,
  titleLabel,
  textLabel,
  textPlaceholder,
  titleInputId,
  textInputId,
  onChangeTitle,
  onChangeText,
}: Props) {
  const colors = useColors();

  return (
    <>
      <View style={{ height: VERSION_TO_TITLE_GAP_PX }} />

      <Text style={sectionLabelStyle(colors.primary)}>{titleLabel}</Text>

      <View style={{ height: LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverTextField nativeID={titleInputId} value={title} onChangeText={onChangeTitle} />

      <View style={{ height: TITLE_TO_TEXT_SECTION_GAP_PX }} />

      <Text style={sectionLabelStyle(colors.primary)}>{textLabel}</Text>

      <View style={{ height: LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverMultilineField
        nativeID={textInputId}
        value={text}
        onChangeText={onChangeText}
        placeholder={textPlaceholder}
      />
    </>
  );
}

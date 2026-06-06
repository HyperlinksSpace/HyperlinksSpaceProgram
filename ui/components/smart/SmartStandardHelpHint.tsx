import { Pressable, Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import {
  typographyRect15,
  uiIconButtonVerticalCompensationTransform,
  useColors,
} from "../../theme";

const CIRCLE_SIZE_PX = 30;
const NAME_TO_HINT_GAP_PX = 10;

const LABEL_FONT_SIZE_PX = 15;

type Props = {
  /** Matches the standard name row font size (15px Rect). */
  labelStyle?: {
    fontSize?: number;
  };
};

/** Placeholder help chip beside a Smart standard name; popup link wired later. */
export function SmartStandardHelpHint({ labelStyle }: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const fontSize = labelStyle?.fontSize ?? LABEL_FONT_SIZE_PX;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("smart.standardHelp.a11y")}
      style={[{ marginLeft: NAME_TO_HINT_GAP_PX }, uiIconButtonVerticalCompensationTransform]}
    >
      <View
        style={{
          width: CIRCLE_SIZE_PX,
          height: CIRCLE_SIZE_PX,
          borderRadius: CIRCLE_SIZE_PX / 2,
          backgroundColor: colors.undercover,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={[
            typographyRect15,
            {
              fontSize,
              lineHeight: fontSize,
              color: colors.primary,
              textAlign: "center",
            },
          ]}
        >
          ?
        </Text>
      </View>
    </Pressable>
  );
}

import { useState } from "react";
import { Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { typographyRect15, useColors } from "../../theme";
import { SmartUndercoverTextField } from "./SmartUndercoverTextField";

const VERSION_TO_TITLE_GAP_PX = 30;
const TITLE_LABEL_TO_INPUT_GAP_PX = 10;

const TITLE_LABEL_FONT_SIZE_PX = 25;
const TITLE_LABEL_LINE_HEIGHT_PX = 40;

const SMART_COMPANY_TITLE_INPUT_ID = "smart-company-title-input";

/** Company purpose fields below the deal version row. */
export function SmartCompanySection() {
  const colors = useColors();
  const { t } = useAppStrings();
  const [title, setTitle] = useState(() => t("smart.company.titleDefault"));

  return (
    <>
      <View style={{ height: VERSION_TO_TITLE_GAP_PX }} />

      <Text
        style={[
          typographyRect15,
          {
            fontSize: TITLE_LABEL_FONT_SIZE_PX,
            lineHeight: TITLE_LABEL_LINE_HEIGHT_PX,
            fontWeight: "400",
            color: colors.primary,
          },
        ]}
      >
        {t("smart.company.titleLabel")}
      </Text>

      <View style={{ height: TITLE_LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverTextField
        nativeID={SMART_COMPANY_TITLE_INPUT_ID}
        value={title}
        onChangeText={setTitle}
      />
    </>
  );
}

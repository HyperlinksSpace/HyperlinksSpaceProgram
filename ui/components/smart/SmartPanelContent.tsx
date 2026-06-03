import { Text, View } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import {
  smartLeadEnImage,
  smartLeadRuImage,
} from "../../smart/smartAssets";
import { typographyAeroport20, useColors } from "../../theme";
import { SmartLeadImage } from "./SmartLeadImage";

const TOP_INSET_PX = 30;
const LEAD_TO_TITLE_GAP_PX = 30;
const TITLE_FONT_SIZE_PX = 40;
const TITLE_LINE_HEIGHT_PX = 55;

/** Smart panel body: deploy flow (wide split column + narrow `/smart`). */
export function SmartPanelContent() {
  const colors = useColors();
  const { t, locale } = useAppStrings();
  const leadSource = locale === "ru" ? smartLeadRuImage : smartLeadEnImage;

  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        minHeight: 0,
        paddingTop: TOP_INSET_PX,
      }}
    >
      <SmartLeadImage source={leadSource} />
      <View style={{ height: LEAD_TO_TITLE_GAP_PX }} />
      <Text
        style={[
          typographyAeroport20,
          {
            fontSize: TITLE_FONT_SIZE_PX,
            lineHeight: TITLE_LINE_HEIGHT_PX,
            color: colors.primary,
          },
        ]}
      >
        {t("smart.deployTitle")}
      </Text>
    </View>
  );
}

import { Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import {
  smartLeadEnImage,
  smartLeadRuImage,
} from "../../smart/smartAssets";
import { layout, typographyAeroport20, typographyRect15, useColors } from "../../theme";
import { HspScrollColumn } from "../HspScrollColumn";
import { SmartLeadImage } from "./SmartLeadImage";
import { SmartPurposeSection } from "./SmartPurposeSection";

const TOP_INSET_PX = 30;
const BOTTOM_INSET_PX = 30;
const LEAD_TO_TITLE_GAP_PX = 30;
const TITLE_FONT_SIZE_PX = 40;
const TITLE_LINE_HEIGHT_PX = 55;
const TITLE_TO_INTRO_GAP_PX = 15;
const INTRO_FONT_SIZE_PX = 15;
const INTRO_LINE_HEIGHT_PX = 30;
const INTRO_TO_PURPOSE_GAP_PX = 20;

/** Smart panel body: deploy flow (wide split column + narrow `/smart`). */
export function SmartPanelContent() {
  const colors = useColors();
  const { t, locale } = useAppStrings();
  const leadSource = locale === "ru" ? smartLeadRuImage : smartLeadEnImage;
  const contentInset = layout.contentSideInsetPx;
  const scrollShellBleed = { marginHorizontal: -contentInset };
  const scrollContentPadding = {
    paddingTop: TOP_INSET_PX,
    paddingHorizontal: contentInset,
    paddingBottom: BOTTOM_INSET_PX,
  };

  return (
    <View style={{ flex: 1, width: "100%", alignSelf: "stretch", minHeight: 0 }}>
      <HspScrollColumn style={{ flex: 1, ...scrollShellBleed }} contentContainerStyle={scrollContentPadding}>
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

        <View style={{ height: TITLE_TO_INTRO_GAP_PX }} />
        <Text
          style={[
            typographyRect15,
            {
              fontSize: INTRO_FONT_SIZE_PX,
              lineHeight: INTRO_LINE_HEIGHT_PX,
              color: colors.primary,
            },
          ]}
        >
          {t("smart.intro")}
        </Text>

        <View style={{ height: INTRO_TO_PURPOSE_GAP_PX }} />
        <SmartPurposeSection purposeSubtitle={t("smart.purposeSubtitle")} />
      </HspScrollColumn>
    </View>
  );
}

import { Text, View } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { typographyAeroport20, useColors } from "../../theme";

const TOP_INSET_PX = 30;
const TITLE_FONT_SIZE_PX = 40;
const TITLE_LINE_HEIGHT_PX = 55;

/** Smarts panel body: deploy flow (wide split column + narrow `/smarts`). */
export function SmartsPanelContent() {
  const colors = useColors();
  const { t } = useAppStrings();

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
        {t("smarts.deployTitle")}
      </Text>
    </View>
  );
}

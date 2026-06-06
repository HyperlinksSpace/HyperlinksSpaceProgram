import { useCallback, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import type { AppStringKey } from "../../../locales/appStrings";
import { useAppStrings } from "../../../locales/AppStringsContext";
import {
  SMART_PURPOSE_KEYS,
  type SmartPurposeKey,
} from "../../smart/smartPurposeTypes";
import { typographyAeroport20, typographyRect15, useColors } from "../../theme";
import { SmartPurposeMenuWithDivider } from "./SmartPurposeMenuWithDivider";
import { SmartStandardHelpHint } from "./SmartStandardHelpHint";

const SUBTITLE_TO_MENU_GAP_PX = 15;
const MENU_ITEM_GAP_PX = 20;
const MENU_TO_DIVIDER_GAP_PX = 15;
const DIVIDER_TO_DESC_GAP_PX = 15;
const DESC_TO_STANDARD_GAP_PX = 30;
const STANDARD_TO_VERSION_GAP_PX = 15;

const MENU_FONT_SIZE_PX = 15;
const MENU_LINE_HEIGHT_PX = 20;
const DESC_FONT_SIZE_PX = 15;
const DESC_LINE_HEIGHT_PX = 30;
const STANDARD_FONT_SIZE_PX = 25;
const STANDARD_LINE_HEIGHT_PX = 40;
const VERSION_FONT_SIZE_PX = 15;
const VERSION_LINE_HEIGHT_PX = 20;

const MENU_LABEL_KEYS: Record<SmartPurposeKey, AppStringKey> = {
  company: "smart.purpose.company",
  agreement: "smart.purpose.agreement",
  investment: "smart.purpose.investment",
  revenue: "smart.purpose.revenue",
  partners: "smart.purpose.partners",
};

const DESC_LEAD_KEYS: Record<SmartPurposeKey, AppStringKey> = {
  company: "smart.purposeDescLead.company",
  agreement: "smart.purposeDescLead.agreement",
  investment: "smart.purposeDescLead.investment",
  revenue: "smart.purposeDescLead.revenue",
  partners: "smart.purposeDescLead.partners",
};

const DESC_BODY_KEYS: Record<SmartPurposeKey, AppStringKey> = {
  company: "smart.purposeDescBody.company",
  agreement: "smart.purposeDescBody.agreement",
  investment: "smart.purposeDescBody.investment",
  revenue: "smart.purposeDescBody.revenue",
  partners: "smart.purposeDescBody.partners",
};

const DEAL_VERSION_KEYS: Record<SmartPurposeKey, AppStringKey> = {
  company: "smart.dealVersion.company",
  agreement: "smart.dealVersion.agreement",
  investment: "smart.dealVersion.investment",
  revenue: "smart.dealVersion.revenue",
  partners: "smart.dealVersion.partners",
};

type Props = {
  purposeSubtitle: string;
};

export function SmartPurposeSection({ purposeSubtitle }: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const [activeKey, setActiveKey] = useState<SmartPurposeKey>("company");

  const renderMenuItems = useCallback(
    () =>
      SMART_PURPOSE_KEYS.map((key, index) => (
        <View key={key} style={{ flexDirection: "row", alignItems: "flex-start" }}>
          {index > 0 ? <View style={{ width: MENU_ITEM_GAP_PX }} /> : null}
          <Pressable
            onPress={() => setActiveKey(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: activeKey === key }}
          >
            <Text
              style={[
                typographyRect15,
                {
                  fontSize: MENU_FONT_SIZE_PX,
                  lineHeight: MENU_LINE_HEIGHT_PX,
                  color: activeKey === key ? colors.primary : colors.secondary,
                  flexShrink: 0,
                  ...(Platform.OS === "web" ? { whiteSpace: "nowrap" as const } : null),
                },
              ]}
            >
              {t(MENU_LABEL_KEYS[key])}
            </Text>
          </Pressable>
        </View>
      )),
    [activeKey, colors.primary, colors.secondary, t],
  );

  return (
    <>
      <Text
        style={[
          typographyAeroport20,
          {
            fontSize: STANDARD_FONT_SIZE_PX,
            lineHeight: STANDARD_LINE_HEIGHT_PX,
            color: colors.primary,
          },
        ]}
      >
        {purposeSubtitle}
      </Text>

      <View style={{ height: SUBTITLE_TO_MENU_GAP_PX }} />

      <SmartPurposeMenuWithDivider
        menuLineHeightPx={MENU_LINE_HEIGHT_PX}
        gapAboveDividerPx={MENU_TO_DIVIDER_GAP_PX}
        renderMenuItems={renderMenuItems}
      />

      <View style={{ height: DIVIDER_TO_DESC_GAP_PX }} />

      <Text
        style={[
          typographyRect15,
          {
            fontSize: DESC_FONT_SIZE_PX,
            lineHeight: DESC_LINE_HEIGHT_PX,
            color: colors.primary,
          },
        ]}
      >
        <Text style={{ fontStyle: "italic" }}>{t(DESC_LEAD_KEYS[activeKey])}</Text>
        {t(DESC_BODY_KEYS[activeKey])}
      </Text>

      <View style={{ height: DESC_TO_STANDARD_GAP_PX }} />

      <Text
        style={[
          typographyAeroport20,
          {
            fontSize: STANDARD_FONT_SIZE_PX,
            lineHeight: STANDARD_LINE_HEIGHT_PX,
            color: colors.primary,
          },
        ]}
      >
        {t("smart.standardSubtitle")}
      </Text>

      <View style={{ height: STANDARD_TO_VERSION_GAP_PX }} />

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          style={[
            typographyRect15,
            {
              fontSize: VERSION_FONT_SIZE_PX,
              lineHeight: VERSION_LINE_HEIGHT_PX,
              color: colors.primary,
            },
          ]}
        >
          {t(DEAL_VERSION_KEYS[activeKey])}
        </Text>
        <SmartStandardHelpHint labelStyle={{ fontSize: VERSION_FONT_SIZE_PX }} />
      </View>
    </>
  );
}

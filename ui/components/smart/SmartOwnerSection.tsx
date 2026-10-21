import { useState } from "react";
import { Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { typographyRect15, useColors } from "../../theme";
import { SmartFormBottomTextLane } from "./SmartFormBottomTextLane";
import { SmartFormCapsLabel } from "./SmartFormCapsLabel";
import { SmartTitleTextSection } from "./SmartTitleTextSection";
import { SmartUndercoverTextField } from "./SmartUndercoverTextField";

const TEXT_FORM_TO_OWNER_GAP_PX = 30;
const OWNER_TITLE_TO_SUBTITLE_GAP_PX = 15;
const OWNER_SUBTITLE_TO_HINT_GAP_PX = 20;
const OWNER_HINT_TO_LABEL_GAP_PX = 30;
const CAPS_LABEL_TO_INPUT_GAP_PX = 20;

const SECTION_LABEL_FONT_SIZE_PX = 25;
const SECTION_LABEL_LINE_HEIGHT_PX = 40;

const SMART_OWNER_TITLE_INPUT_ID = "smart-owner-title-input";
const SMART_OWNER_TEXT_INPUT_ID = "smart-owner-text-input";
const SMART_OWNER_WALLET_INPUT_ID = "smart-owner-wallet-input";

const sectionLabelStyle = (color: string) => [
  typographyRect15,
  {
    fontSize: SECTION_LABEL_FONT_SIZE_PX,
    lineHeight: SECTION_LABEL_LINE_HEIGHT_PX,
    fontWeight: "400" as const,
    color,
  },
];

/** Owner purpose fields: title, text, and the wallet that controls this Owner contract. */
export function SmartOwnerSection() {
  const colors = useColors();
  const { t } = useAppStrings();
  const [title, setTitle] = useState(() => t("smart.owner.titleDefault"));
  const [bodyText, setBodyText] = useState("");
  const [ownerWallet, setOwnerWallet] = useState("");

  return (
    <>
      <SmartTitleTextSection
        title={title}
        text={bodyText}
        titleLabel={t("smart.owner.titleLabel")}
        textLabel={t("smart.owner.textLabel")}
        textPlaceholder={t("smart.owner.textPlaceholder")}
        titleInputId={SMART_OWNER_TITLE_INPUT_ID}
        textInputId={SMART_OWNER_TEXT_INPUT_ID}
        onChangeTitle={setTitle}
        onChangeText={setBodyText}
      />

      <View style={{ height: TEXT_FORM_TO_OWNER_GAP_PX }} />

      <Text style={sectionLabelStyle(colors.primary)}>{t("smart.owner.controllerTitle")}</Text>

      <View style={{ height: OWNER_TITLE_TO_SUBTITLE_GAP_PX }} />

      <SmartFormBottomTextLane color={colors.primary}>
        {t("smart.owner.controllerSubtitle")}
      </SmartFormBottomTextLane>

      <View style={{ height: OWNER_SUBTITLE_TO_HINT_GAP_PX }} />

      <Text
        style={[
          typographyRect15,
          {
            fontSize: 15,
            lineHeight: 22,
            fontWeight: "400",
            color: colors.secondary,
          },
        ]}
      >
        {t("smart.owner.controllerHint")}
      </Text>

      <View style={{ height: OWNER_HINT_TO_LABEL_GAP_PX }} />

      <SmartFormCapsLabel color={colors.primary}>{t("smart.owner.ownerWalletLabel")}</SmartFormCapsLabel>

      <View style={{ height: CAPS_LABEL_TO_INPUT_GAP_PX }} />

      <SmartUndercoverTextField
        nativeID={SMART_OWNER_WALLET_INPUT_ID}
        value={ownerWallet}
        onChangeText={setOwnerWallet}
        placeholder={t("smart.owner.ownerWalletPlaceholder")}
      />
    </>
  );
}

import { Pressable, Text, View } from "react-native";
import { useAppStrings } from "../../locales/AppStringsContext";
import { typographyRect15, useColors } from "../theme";
import { useTelegram } from "./Telegram";
import { AppModalSheet, AppModalSheetBackFooter, appModalSheetStyles } from "./AppModalSheet";
import { useSettingsSheet } from "../settings/SettingsContext";

export function SettingsSheet() {
  const colors = useColors();
  const { t, tf, welcomeFeedManualTranslation, setWelcomeFeedManualTranslation } = useAppStrings();
  const { telegramUsername } = useTelegram();
  const { settingsSheetVisible, closeSettingsSheet } = useSettingsSheet();

  return (
    <AppModalSheet
      visible={settingsSheetVisible}
      onClose={closeSettingsSheet}
      title={t("settings.sheetTitle")}
      footer={
        <AppModalSheetBackFooter onClose={closeSettingsSheet} label={t("common.back")} />
      }
    >
      {telegramUsername ? (
        <Text style={[typographyRect15, appModalSheetStyles.body, { color: colors.secondary }]}>
          {tf("home.wallet.loggedInAs", { username: telegramUsername })}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: welcomeFeedManualTranslation }}
        accessibilityLabel={t("feed.manualWelcomeTranslationA11y")}
        onPress={() => setWelcomeFeedManualTranslation(!welcomeFeedManualTranslation)}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}
      >
        <View
          style={{
            width: 16,
            height: 16,
            borderWidth: 1,
            borderColor: colors.highlight,
            marginRight: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: welcomeFeedManualTranslation ? colors.undercover : "transparent",
          }}
        >
          {welcomeFeedManualTranslation ? (
            <Text style={{ color: colors.primary, fontSize: 11, lineHeight: 14 }}>✓</Text>
          ) : null}
        </View>
        <Text style={[typographyRect15, { color: colors.secondary, flex: 1, textAlign: "left" }]}>
          {t("feed.manualWelcomeTranslation")}
        </Text>
      </Pressable>
    </AppModalSheet>
  );
}

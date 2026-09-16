import { useCallback } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyAeroport15, typographyRect15, useColors } from "../../theme";
import { AppModalSheet } from "../AppModalSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  onChooseTonConnect: () => void;
  onChooseRecoveryPhrase: () => void;
};

/**
 * First step after “Add wallet”: pick how to add (TON Connect vs recovery phrase).
 * Network is TON-only for now; layout leaves room for more networks later.
 */
export function AddWalletMethodDialog({
  visible,
  onClose,
  onChooseTonConnect,
  onChooseRecoveryPhrase,
}: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const labelFont = Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR;

  const chooseTonConnect = useCallback(() => {
    onClose();
    onChooseTonConnect();
  }, [onClose, onChooseTonConnect]);

  const choosePhrase = useCallback(() => {
    onClose();
    onChooseRecoveryPhrase();
  }, [onClose, onChooseRecoveryPhrase]);

  if (!visible) return null;

  return (
    <AppModalSheet
      visible
      onClose={onClose}
      title={t("home.header.addWalletTitle")}
      sizeStorageKey="hsp.addWalletMethod.size.v2"
      offsetStorageKey="hsp.addWalletMethod.offset.v1"
    >
      <View style={{ gap: 16 }}>
        <Text
          style={{
            color: colors.secondary,
            fontSize: 14,
            lineHeight: 20,
            fontFamily: labelFont,
          }}
        >
          {t("home.header.addWalletSubtitle")}
        </Text>

        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: colors.secondary,
              fontSize: 12,
              lineHeight: 16,
              fontFamily: labelFont,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {t("home.header.addWalletNetworkLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: colors.undercover,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={[typographyAeroport15, { color: colors.primary }]}>
                {t("home.header.networkTon")}
              </Text>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.highlight,
                paddingHorizontal: 12,
                paddingVertical: 8,
                opacity: 0.55,
              }}
            >
              <Text style={[typographyAeroport15, { color: colors.secondary }]}>
                {t("home.header.networkMoreSoon")}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            onPress={chooseTonConnect}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: colors.highlight,
              backgroundColor: pressed ? colors.undercover : colors.background,
              paddingHorizontal: 14,
              paddingVertical: 14,
              gap: 4,
            })}
          >
            <Text style={[typographyAeroport15, { color: colors.primary, fontWeight: "400" }]}>
              {t("home.header.addWalletTonConnect")}
            </Text>
            <Text
              style={{
                color: colors.secondary,
                fontSize: 13,
                lineHeight: 18,
                fontFamily: labelFont,
              }}
            >
              {t("home.header.addWalletTonConnectHint")}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={choosePhrase}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: colors.highlight,
              backgroundColor: pressed ? colors.undercover : colors.background,
              paddingHorizontal: 14,
              paddingVertical: 14,
              gap: 4,
            })}
          >
            <Text style={[typographyAeroport15, { color: colors.primary, fontWeight: "400" }]}>
              {t("home.header.addWalletRecoveryPhrase")}
            </Text>
            <Text
              style={{
                color: colors.secondary,
                fontSize: 13,
                lineHeight: 18,
                fontFamily: labelFont,
              }}
            >
              {t("home.header.addWalletRecoveryPhraseHint")}
            </Text>
            <Text
              style={{
                color: colors.secondary,
                fontSize: 12,
                lineHeight: 17,
                fontFamily: labelFont,
                marginTop: 4,
              }}
            >
              {t("home.header.addWalletRecoveryPhraseLocalOnly")}
            </Text>
          </Pressable>
        </View>

        <Text style={[typographyRect15, { color: colors.secondary, fontSize: 12, lineHeight: 16 }]}>
          {t("home.header.addWalletTonOnlyNote")}
        </Text>
      </View>
    </AppModalSheet>
  );
}

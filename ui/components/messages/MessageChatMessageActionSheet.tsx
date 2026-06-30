import { Platform, Pressable, Text, View } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, type ThemeColors } from "../../theme";
import { AppModalSheet } from "../AppModalSheet";

type Props = {
  visible: boolean;
  colors: ThemeColors;
  canEdit: boolean;
  onClose: () => void;
  onReply: () => void;
  onEdit: () => void;
};

export function MessageChatMessageActionSheet({
  visible,
  colors,
  canEdit,
  onClose,
  onReply,
  onEdit,
}: Props) {
  const { t } = useAppStrings();

  return (
    <AppModalSheet visible={visible} onClose={onClose} title="">
      <View style={{ gap: 8 }}>
        <Pressable
          onPress={onReply}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 4,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text
            style={[
              typographyRect15,
              {
                color: colors.primary,
                textAlign: "left",
                fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
              },
            ]}
          >
            {t("messages.action.reply")}
          </Text>
        </Pressable>
        {canEdit ? (
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: "center",
              paddingHorizontal: 4,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Text
              style={[
                typographyRect15,
                {
                  color: colors.primary,
                  textAlign: "left",
                  fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
                },
              ]}
            >
              {t("messages.action.edit")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </AppModalSheet>
  );
}

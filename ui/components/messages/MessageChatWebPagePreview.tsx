import { Image, Linking, Platform, Pressable, Text, View } from "react-native";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, type ThemeColors } from "../../theme";
import type { MessageChatWebPagePreview } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_FONT_SIZE_PX,
  MESSAGE_BUBBLE_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_REPLY_BAR_WIDTH_PX,
  MESSAGE_BUBBLE_REPLY_PADDING_PX,
} from "./messageChatLayout";

const WEB_PAGE_THUMB_PX = 48;
const WEB_PAGE_SITE_FONT_PX = 13;
const WEB_PAGE_DESC_LINES = 2;

type Props = {
  preview: MessageChatWebPagePreview;
  colors: ThemeColors;
  maxWidthPx: number;
  /** Accent bar color — typically the message sender color. */
  accentColor: string;
};

export function MessageChatWebPagePreviewCard({
  preview,
  colors,
  maxWidthPx,
  accentColor,
}: Props) {
  const siteName = preview.site_name?.trim() || null;
  const title =
    preview.title?.trim() ||
    preview.display_url?.trim() ||
    preview.url.trim();
  const description = preview.description?.trim() || null;
  const thumb = preview.photo_minithumbnail_data_url?.trim() || null;
  const openUrl = preview.url.trim();

  const onPress = () => {
    if (!openUrl) return;
    void Linking.openURL(openUrl).catch(() => {});
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={title}
      style={{
        marginTop: 6,
        maxWidth: maxWidthPx,
        alignSelf: "stretch",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: MESSAGE_BUBBLE_REPLY_BAR_WIDTH_PX,
          backgroundColor: accentColor,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          paddingLeft: MESSAGE_BUBBLE_REPLY_PADDING_PX + MESSAGE_BUBBLE_REPLY_BAR_WIDTH_PX,
          paddingRight: 0,
          paddingVertical: 0,
          gap: 8,
          minWidth: 0,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {siteName ? (
            <Text
              numberOfLines={1}
              style={{
                ...typographyRect15,
                fontSize: WEB_PAGE_SITE_FONT_PX,
                lineHeight: 18,
                fontWeight: "500",
                color: accentColor,
                fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
              }}
            >
              {siteName}
            </Text>
          ) : null}
          <Text
            numberOfLines={2}
            style={{
              ...typographyRect15,
              fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
              lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
              fontWeight: "500",
              color: colors.primary,
              fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
            }}
          >
            {title}
          </Text>
          {description ? (
            <Text
              numberOfLines={WEB_PAGE_DESC_LINES}
              style={{
                ...typographyRect15,
                fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX - 1,
                lineHeight: 20,
                fontWeight: "400",
                color: colors.secondary,
                fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
              }}
            >
              {description}
            </Text>
          ) : null}
        </View>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={{
              width: WEB_PAGE_THUMB_PX,
              height: WEB_PAGE_THUMB_PX,
              borderRadius: 0,
              backgroundColor: colors.highlight,
            }}
            resizeMode="cover"
          />
        ) : null}
      </View>
    </Pressable>
  );
}

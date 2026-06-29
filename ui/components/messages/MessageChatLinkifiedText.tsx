import { useMemo } from "react";
import { Platform, Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { openMessageLinkUrl } from "./openMessageLinkUrl";
import { messageChatBubbleTextWebWrapStyle } from "./messageChatLayout";
import { parseMessageTextLinks } from "./parseMessageTextLinks";

const MESSAGE_LINK_COLOR = "#3390ec";

type Props = {
  text: string;
  style: StyleProp<TextStyle>;
  linkColor?: string;
} & Pick<TextProps, "numberOfLines">;

export function MessageChatLinkifiedText({
  text,
  style,
  linkColor = MESSAGE_LINK_COLOR,
  numberOfLines,
}: Props) {
  const segments = useMemo(() => parseMessageTextLinks(text), [text]);
  const hasLinks = segments.some((segment) => segment.kind === "link");
  const wrapStyle =
    Platform.OS === "web" ? (messageChatBubbleTextWebWrapStyle as TextStyle) : null;
  const resolvedStyle = wrapStyle ? [style, wrapStyle] : style;

  if (!hasLinks) {
    return (
      <Text style={resolvedStyle} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const linkStyle = {
    color: linkColor,
    textDecorationLine: "underline" as const,
    ...(Platform.OS === "web"
      ? ({ cursor: "pointer", ...messageChatBubbleTextWebWrapStyle } as object)
      : null),
  };

  return (
    <Text style={resolvedStyle} numberOfLines={numberOfLines}>
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          <Text key={index}>{segment.text}</Text>
        ) : (
          <Text
            key={index}
            style={linkStyle}
            onPress={() => openMessageLinkUrl(segment.url)}
            accessibilityRole="link"
          >
            {segment.text}
          </Text>
        ),
      )}
    </Text>
  );
}

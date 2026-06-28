import { useMemo } from "react";
import { Platform, Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { openMessageLinkUrl } from "./openMessageLinkUrl";
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

  if (!hasLinks) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const linkStyle = {
    color: linkColor,
    textDecorationLine: "underline" as const,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
  };

  return (
    <Text style={style} numberOfLines={numberOfLines}>
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

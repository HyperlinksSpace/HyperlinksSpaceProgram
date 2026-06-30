import { createElement, useMemo } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { FormattedTextSegment } from "../../../shared/formattedTextSegments";
import {
  normalizeFormattedTextSegments,
  segmentsContainTelegramEmoji,
} from "../../../shared/formattedTextSegments";
import { openMessageLinkUrl } from "./openMessageLinkUrl";
import { messageChatBubbleTextWebWrapStyle } from "./messageChatLayout";
import { MessageChatInlineTgsEmoji } from "./MessageChatInlineTgsEmoji";
import { parseMessageTextLinks } from "./parseMessageTextLinks";

const MESSAGE_LINK_COLOR = "#3390ec";
const DEFAULT_INLINE_EMOJI_SIZE_PX = 20;

type Props = {
  text: string;
  segments?: FormattedTextSegment[] | null;
  style: StyleProp<TextStyle>;
  linkColor?: string;
  emojiSizePx?: number;
  /** Lower canvas quality + lazy fetch for chat-list rows. */
  lowPriorityEmoji?: boolean;
} & Pick<TextProps, "numberOfLines">;

function resolveSegments(
  text: string,
  segments?: FormattedTextSegment[] | null,
): FormattedTextSegment[] {
  const normalized = segments ? normalizeFormattedTextSegments(segments) : null;
  if (
    normalized &&
    (segmentsContainTelegramEmoji(normalized) || normalized.some((segment) => segment.kind === "link"))
  ) {
    return normalized;
  }
  return parseMessageTextLinks(text);
}

function textStyleFromProp(style: StyleProp<TextStyle>): TextStyle {
  return StyleSheet.flatten(style) ?? {};
}

function renderTelegramEmojiNode(
  segment: Extract<FormattedTextSegment, { kind: "custom_emoji" | "animated_emoji" }>,
  sizePx: number,
  lowPriority?: boolean,
) {
  return (
    <MessageChatInlineTgsEmoji
      customEmojiId={segment.kind === "custom_emoji" ? segment.custom_emoji_id : undefined}
      emoji={segment.kind === "animated_emoji" ? segment.emoji : undefined}
      sizePx={sizePx}
      fallbackText={segment.text}
      lowPriority={lowPriority}
    />
  );
}

function RichTextWebRow({
  segments,
  style,
  linkColor,
  emojiSizePx,
  numberOfLines,
  lowPriorityEmoji,
}: {
  segments: FormattedTextSegment[];
  style: TextStyle;
  linkColor: string;
  emojiSizePx: number;
  numberOfLines?: number;
  lowPriorityEmoji?: boolean;
}) {
  const wrapStyle =
    Platform.OS === "web" ? (messageChatBubbleTextWebWrapStyle as TextStyle) : null;
  const textStyle = wrapStyle ? { ...style, ...wrapStyle } : style;
  const linkStyle = {
    ...textStyle,
    color: linkColor,
    textDecorationLine: "underline" as const,
    ...(Platform.OS === "web"
      ? ({ cursor: "pointer", ...messageChatBubbleTextWebWrapStyle } as object)
      : null),
  };

  const rowStyle: ViewStyle = {
    flexDirection: "row",
    flexWrap: numberOfLines === 1 ? "nowrap" : "wrap",
    alignItems: "flex-end",
    overflow: numberOfLines === 1 ? "hidden" : "visible",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  };

  return (
    <View style={rowStyle}>
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          return (
            <Text key={index} style={textStyle} numberOfLines={numberOfLines}>
              {segment.text}
            </Text>
          );
        }
        if (segment.kind === "custom_emoji" || segment.kind === "animated_emoji") {
          return (
            <View
              key={index}
              style={{
                width: emojiSizePx,
                height: emojiSizePx,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {renderTelegramEmojiNode(segment, emojiSizePx, lowPriorityEmoji)}
            </View>
          );
        }
        return (
          <Text
            key={index}
            style={linkStyle}
            numberOfLines={numberOfLines}
            onPress={() => openMessageLinkUrl(segment.url)}
            accessibilityRole="link"
          >
            {segment.text}
          </Text>
        );
      })}
    </View>
  );
}

function renderTelegramEmojiInline(
  segment: Extract<FormattedTextSegment, { kind: "custom_emoji" | "animated_emoji" }>,
  sizePx: number,
  key: number,
  lowPriority?: boolean,
) {
  const emojiNode = renderTelegramEmojiNode(segment, sizePx, lowPriority);

  if (Platform.OS === "web") {
    return createElement(
      "span",
      {
        key,
        style: {
          display: "inline-block",
          width: sizePx,
          height: sizePx,
          verticalAlign: "text-bottom",
          lineHeight: 1,
        },
      },
      emojiNode,
    );
  }

  return (
    <Text key={key} style={{ lineHeight: sizePx }}>
      {emojiNode}
    </Text>
  );
}

export function MessageChatRichText({
  text,
  segments,
  style,
  linkColor = MESSAGE_LINK_COLOR,
  emojiSizePx = DEFAULT_INLINE_EMOJI_SIZE_PX,
  numberOfLines,
  lowPriorityEmoji = false,
}: Props) {
  const resolvedSegments = useMemo(() => resolveSegments(text, segments), [text, segments]);
  const hasTelegramEmoji = segmentsContainTelegramEmoji(resolvedSegments);
  const hasRichContent = resolvedSegments.some(
    (segment) =>
      segment.kind === "link" ||
      segment.kind === "custom_emoji" ||
      segment.kind === "animated_emoji",
  );
  const flatStyle = textStyleFromProp(style);
  const wrapStyle =
    Platform.OS === "web" ? (messageChatBubbleTextWebWrapStyle as TextStyle) : null;
  const resolvedStyle = wrapStyle ? [style, wrapStyle] : style;

  if (!hasRichContent) {
    return (
      <Text style={resolvedStyle} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  if (Platform.OS === "web" && hasTelegramEmoji) {
    return (
      <RichTextWebRow
        segments={resolvedSegments}
        style={flatStyle}
        linkColor={linkColor}
        emojiSizePx={emojiSizePx}
        numberOfLines={numberOfLines}
        lowPriorityEmoji={lowPriorityEmoji}
      />
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
      {resolvedSegments.map((segment, index) => {
        if (segment.kind === "text") {
          return <Text key={index}>{segment.text}</Text>;
        }
        if (segment.kind === "custom_emoji" || segment.kind === "animated_emoji") {
          return renderTelegramEmojiInline(segment, emojiSizePx, index, lowPriorityEmoji);
        }
        return (
          <Text
            key={index}
            style={linkStyle}
            onPress={() => openMessageLinkUrl(segment.url)}
            accessibilityRole="link"
          >
            {segment.text}
          </Text>
        );
      })}
    </Text>
  );
}

/** Backward-compatible alias used in bubble layout. */
export function MessageChatLinkifiedText(props: Props) {
  return <MessageChatRichText {...props} />;
}

import { createElement, useEffect, useMemo } from "react";
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
import { telegramEmojiDebug } from "./telegramEmojiDebug";

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
  /** Single-line bubble row: do not break words (inline time + checks). */
  nowrap?: boolean;
} & Pick<TextProps, "numberOfLines">;

function resolveSegments(
  text: string,
  segments?: FormattedTextSegment[] | null,
): FormattedTextSegment[] {
  const normalized = segments ? normalizeFormattedTextSegments(segments) : null;
  const base =
    normalized ??
    (parseMessageTextLinks(text) as FormattedTextSegment[]);
  if (!base.length) {
    return text ? [{ kind: "text", text }] : [];
  }
  return base;
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
  nowrap = false,
}: {
  segments: FormattedTextSegment[];
  style: TextStyle;
  linkColor: string;
  emojiSizePx: number;
  numberOfLines?: number;
  lowPriorityEmoji?: boolean;
  nowrap?: boolean;
}) {
  const wrapStyle =
    Platform.OS === "web" && !nowrap ? (messageChatBubbleTextWebWrapStyle as TextStyle) : null;
  const textStyle = wrapStyle ? { ...style, ...wrapStyle } : style;
  const nowrapStyle =
    Platform.OS === "web" && nowrap ? ({ whiteSpace: "nowrap" } as TextStyle) : null;
  const resolvedTextStyle = nowrapStyle ? { ...textStyle, ...nowrapStyle } : textStyle;
  const linkStyle = {
    ...resolvedTextStyle,
    color: linkColor,
    textDecorationLine: "underline" as const,
    ...(Platform.OS === "web"
      ? ({
          cursor: "pointer",
          ...(nowrap ? null : messageChatBubbleTextWebWrapStyle),
        } as object)
      : null),
  };

  const rowStyle: ViewStyle = {
    flexDirection: "row",
    flexWrap: nowrap || numberOfLines === 1 ? "nowrap" : "wrap",
    alignItems: "flex-end",
    overflow: numberOfLines === 1 || nowrap ? "hidden" : "visible",
    ...(nowrap
      ? { flexGrow: 0, flexShrink: 0, alignSelf: "flex-start" as const }
      : {
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minWidth: 0,
          maxWidth: "100%",
          alignSelf: "stretch",
        }),
  };

  return (
    <View style={rowStyle}>
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          return (
            <Text key={index} style={resolvedTextStyle} numberOfLines={numberOfLines}>
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
  nowrap = false,
}: Props) {
  const resolvedSegments = useMemo(() => resolveSegments(text, segments), [text, segments]);
  const hasTelegramEmoji = segmentsContainTelegramEmoji(resolvedSegments);

  useEffect(() => {
    telegramEmojiDebug.richTextSegments("message_chat_rich_text", text, resolvedSegments);
  }, [resolvedSegments, text]);

  const hasRichContent = resolvedSegments.some(
    (segment) =>
      segment.kind === "link" ||
      segment.kind === "custom_emoji" ||
      segment.kind === "animated_emoji",
  );
  const flatStyle = textStyleFromProp(style);
  const wrapStyle =
    Platform.OS === "web" && !nowrap ? (messageChatBubbleTextWebWrapStyle as TextStyle) : null;
  const nowrapStyle =
    Platform.OS === "web" && nowrap ? ({ whiteSpace: "nowrap" } as TextStyle) : null;
  const resolvedStyle = [
    style,
    wrapStyle,
    nowrapStyle,
  ];

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
        nowrap={nowrap}
      />
    );
  }

  const linkStyle = {
    color: linkColor,
    textDecorationLine: "underline" as const,
    ...(Platform.OS === "web"
      ? ({
          cursor: "pointer",
          ...(nowrap ? null : messageChatBubbleTextWebWrapStyle),
        } as object)
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

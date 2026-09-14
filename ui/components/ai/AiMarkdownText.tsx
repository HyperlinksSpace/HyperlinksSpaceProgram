/**
 * Lightweight Markdown → React Native Text for AI column replies.
 */
import { useMemo, type ReactNode } from "react";
import {
  Linking,
  Platform,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";

import {
  FONT_UI_SANS_REGULAR,
  FONT_UI_SANS_SEMIBOLD,
  WEB_UI_SANS_STACK,
} from "../../fonts";
import {
  aiMarkdownToPlainText,
  parseAiMarkdownBlocks,
  type AiInlineNode,
} from "./aiMarkdownParse";

export {
  aiMarkdownToPlainText,
  parseAiMarkdownBlocks,
  parseAiInline,
  stripIncompleteAiMarkdownTail,
  summarizeAiMarkdownBlocks,
} from "./aiMarkdownParse";

type Props = {
  content: string;
  style?: StyleProp<TextStyle>;
  mutedColor?: string;
  linkColor?: string;
};

function renderInline(
  nodes: AiInlineNode[],
  baseStyle: StyleProp<TextStyle>,
  opts: { mutedColor?: string; linkColor?: string; boldFamily: string },
): ReactNode[] {
  return nodes.map((n, idx) => {
    const key = `i-${idx}`;
    if (n.kind === "text") {
      return (
        <Text key={key} style={baseStyle}>
          {n.text}
        </Text>
      );
    }
    if (n.kind === "bold") {
      return (
        <Text
          key={key}
          style={[
            baseStyle,
            {
              fontFamily: opts.boldFamily,
              fontWeight: Platform.OS === "web" ? ("600" as const) : undefined,
            },
          ]}
        >
          {n.text}
        </Text>
      );
    }
    if (n.kind === "italic") {
      return (
        <Text key={key} style={[baseStyle, { fontStyle: "italic" }]}>
          {n.text}
        </Text>
      );
    }
    if (n.kind === "code") {
      return (
        <Text
          key={key}
          style={[
            baseStyle,
            {
              fontFamily: Platform.OS === "web" ? "ui-monospace, monospace" : undefined,
              backgroundColor: "rgba(127,127,127,0.15)",
              color: opts.mutedColor,
            },
          ]}
        >
          {n.text}
        </Text>
      );
    }
    return (
      <Text
        key={key}
        style={[baseStyle, { color: opts.linkColor, textDecorationLine: "underline" }]}
        onPress={() => {
          const href = n.href?.trim();
          if (href) void Linking.openURL(href);
        }}
      >
        {n.text}
      </Text>
    );
  });
}

export function AiMarkdownText({ content, style, mutedColor, linkColor }: Props) {
  const blocks = useMemo(() => parseAiMarkdownBlocks(content), [content]);
  const boldFamily =
    Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_SEMIBOLD;
  const baseFamily =
    Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR;

  const textStyle: StyleProp<TextStyle> = [{ fontFamily: baseFamily }, style];

  const inlineOpts = {
    mutedColor,
    linkColor: linkColor ?? mutedColor,
    boldFamily,
  };

  return (
    <View style={{ gap: 6 }}>
      {blocks.map((b, idx) => {
        const key = `b-${idx}`;
        if (b.kind === "blank") {
          return <View key={key} style={{ height: 4 }} />;
        }
        if (b.kind === "code_block") {
          return (
            <View
              key={key}
              style={{
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                backgroundColor: "rgba(127,127,127,0.12)",
              }}
            >
              <Text
                style={[
                  textStyle,
                  {
                    fontFamily:
                      Platform.OS === "web" ? "ui-monospace, monospace" : undefined,
                  },
                ]}
              >
                {b.text}
              </Text>
            </View>
          );
        }
        if (b.kind === "heading") {
          return (
            <Text
              key={key}
              style={[
                textStyle,
                {
                  fontFamily: boldFamily,
                  fontWeight: Platform.OS === "web" ? ("600" as const) : undefined,
                  fontSize: b.level <= 2 ? 17 : 15,
                  marginTop: idx === 0 ? 0 : 4,
                },
              ]}
            >
              {renderInline(b.children, textStyle, inlineOpts)}
            </Text>
          );
        }
        if (b.kind === "list_item") {
          const mark = b.ordered ? `${b.index}.` : "•";
          return (
            <View
              key={key}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingLeft: 4 + b.depth * 14,
                gap: 8,
              }}
            >
              <Text style={[textStyle, { minWidth: b.ordered ? 22 : 12 }]}>{mark}</Text>
              <Text style={[textStyle, { flex: 1 }]}>
                {renderInline(b.children, textStyle, inlineOpts)}
              </Text>
            </View>
          );
        }
        return (
          <Text key={key} style={textStyle}>
            {renderInline(b.children, textStyle, inlineOpts)}
          </Text>
        );
      })}
    </View>
  );
}

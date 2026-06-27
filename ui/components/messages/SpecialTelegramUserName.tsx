import { createElement, type ReactNode } from "react";
import { Platform, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { MessageChatCrossIcon } from "./MessageChatCrossIcon";
import {
  SPECIAL_USER_CROSS_BADGE_GAP_PX,
  SPECIAL_USER_CROSS_BADGE_SIZE_PX,
  specialUserShowsCrossBadge,
  specialUserShowsShineName,
} from "./specialTelegramUserDisplay";

type Props = {
  name: string;
  telegramUserId: number | null | undefined;
  textStyle: TextStyle;
  numberOfLines?: number;
  textAlign?: "left" | "center" | "right";
  containerStyle?: ViewStyle;
};

function webShineNameNode(name: string, color: string | undefined): ReactNode {
  return createElement(
    "span",
    {
      className: "hsp-special-user-name-shine",
      style: color ? ({ ["--hsp-shine-base" as string]: color } as Record<string, string>) : undefined,
    },
    name,
  );
}

export function SpecialTelegramUserName({
  name,
  telegramUserId,
  textStyle,
  numberOfLines = 1,
  textAlign = "left",
  containerStyle,
}: Props) {
  const trimmed = name.trim();
  const showCross = specialUserShowsCrossBadge(telegramUserId);
  const showShine = specialUserShowsShineName(telegramUserId);
  const shineColor = typeof textStyle.color === "string" ? textStyle.color : undefined;

  const nameContent =
    Platform.OS === "web" && showShine
      ? webShineNameNode(trimmed, shineColor)
      : trimmed;

  const nameText = (
    <Text
      numberOfLines={numberOfLines}
      ellipsizeMode="tail"
      style={[
        textStyle,
        {
          textAlign,
          flexShrink: 1,
          minWidth: 0,
        },
        showCross ? { flex: 0 } : null,
      ]}
    >
      {nameContent}
    </Text>
  );

  if (!showCross) {
    if (textAlign === "center") {
      return (
        <View style={[{ alignItems: "center", maxWidth: "100%" }, containerStyle]}>
          {nameText}
        </View>
      );
    }
    return nameText;
  }

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          flexShrink: 1,
          minWidth: 0,
          maxWidth: "100%",
        },
        textAlign === "center" ? { alignSelf: "center" } : null,
        containerStyle,
      ]}
    >
      <View style={{ flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>{nameText}</View>
      <View style={{ width: SPECIAL_USER_CROSS_BADGE_GAP_PX, flexShrink: 0 }} />
      <View style={{ width: SPECIAL_USER_CROSS_BADGE_SIZE_PX, height: SPECIAL_USER_CROSS_BADGE_SIZE_PX, flexShrink: 0 }}>
        <MessageChatCrossIcon size={SPECIAL_USER_CROSS_BADGE_SIZE_PX} />
      </View>
    </View>
  );
}

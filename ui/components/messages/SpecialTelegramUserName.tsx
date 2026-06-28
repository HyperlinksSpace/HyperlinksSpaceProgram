import { createElement, type ReactNode } from "react";
import { Platform, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { MessageChatRussianFlagIcon } from "./MessageChatRussianFlagIcon";
import { MessageChatArtSignIcon } from "./MessageChatArtSignIcon";
import { MessageChatPeaceIcon } from "./MessageChatPeaceIcon";
import { MessageChatCrossIcon } from "./MessageChatCrossIcon";
import { MessageChatStatusTgsBadge } from "./MessageChatStatusTgsBadge";
import {
  SPECIAL_USER_BADGE_GAP_PX,
  SPECIAL_USER_BADGE_SIZE_PX,
  specialUserBadgeKind,
  specialUserDisplayName,
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

function SpecialUserBadge({ kind, size }: { kind: NonNullable<ReturnType<typeof specialUserBadgeKind>>; size: number }) {
  if (kind === "cross") {
    return <MessageChatCrossIcon size={size} />;
  }
  if (kind === "peace_sign") {
    return <MessageChatPeaceIcon size={size} />;
  }
  if (kind === "art_sign") {
    return <MessageChatArtSignIcon size={size} />;
  }
  if (kind === "russian_flag") {
    return <MessageChatRussianFlagIcon size={size} />;
  }
  return <MessageChatStatusTgsBadge size={size} />;
}

export function SpecialTelegramUserName({
  name,
  telegramUserId,
  textStyle,
  numberOfLines = 1,
  textAlign = "left",
  containerStyle,
}: Props) {
  const displayName = specialUserDisplayName(telegramUserId, name);
  const badgeKind = specialUserBadgeKind(telegramUserId, name);
  const showBadge = badgeKind != null;
  const showShine = specialUserShowsShineName(telegramUserId, name);
  const shineColor = typeof textStyle.color === "string" ? textStyle.color : undefined;

  const nameContent =
    Platform.OS === "web" && showShine
      ? webShineNameNode(displayName, shineColor)
      : displayName;

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
        showBadge ? { flex: 0 } : null,
      ]}
    >
      {nameContent}
    </Text>
  );

  if (!showBadge) {
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
      <View style={{ width: SPECIAL_USER_BADGE_GAP_PX, flexShrink: 0 }} />
      <View
        style={{
          width: SPECIAL_USER_BADGE_SIZE_PX,
          height: SPECIAL_USER_BADGE_SIZE_PX,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SpecialUserBadge kind={badgeKind} size={SPECIAL_USER_BADGE_SIZE_PX} />
      </View>
    </View>
  );
}

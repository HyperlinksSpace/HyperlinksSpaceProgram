import { createElement, type ReactNode } from "react";
import { Platform, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { MessageChatRussianFlagIcon } from "./MessageChatRussianFlagIcon";
import { MessageChatArtSignIcon } from "./MessageChatArtSignIcon";
import { MessageChatPeaceIcon } from "./MessageChatPeaceIcon";
import { MessageChatCrossIcon } from "./MessageChatCrossIcon";
import { MessageChatSIcon } from "./MessageChatSIcon";
import { MessageChatStatusTgsBadge } from "./MessageChatStatusTgsBadge";
import { MessageChatInlineTgsEmoji } from "./MessageChatInlineTgsEmoji";
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
  emojiStatusCustomEmojiId?: string | null;
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
  if (kind === "s_sign") {
    return <MessageChatSIcon size={size} />;
  }
  return <MessageChatStatusTgsBadge size={size} />;
}

export function SpecialTelegramUserName({
  name,
  telegramUserId,
  emojiStatusCustomEmojiId,
  textStyle,
  numberOfLines = 1,
  textAlign = "left",
  containerStyle,
}: Props) {
  const displayName = specialUserDisplayName(telegramUserId, name);
  const badgeKind = specialUserBadgeKind(telegramUserId, name);
  const showSpecialBadge = badgeKind != null;
  const telegramEmojiStatusId = emojiStatusCustomEmojiId?.trim() || null;
  const showTelegramEmojiStatus = !showSpecialBadge && Boolean(telegramEmojiStatusId);
  const showBadge = showSpecialBadge || showTelegramEmojiStatus;
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
        textAlign === "center" ? { alignSelf: "center", justifyContent: "center" } : null,
        containerStyle,
      ]}
    >
      <View
        style={{
          flexShrink: 1,
          minWidth: 0,
          maxWidth: "100%",
          alignItems: textAlign === "center" ? "center" : undefined,
        }}
      >
        {nameText}
      </View>
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
        {showSpecialBadge && badgeKind ? (
          <SpecialUserBadge kind={badgeKind} size={SPECIAL_USER_BADGE_SIZE_PX} />
        ) : null}
        {showTelegramEmojiStatus && telegramEmojiStatusId ? (
          <MessageChatInlineTgsEmoji
            customEmojiId={telegramEmojiStatusId}
            sizePx={SPECIAL_USER_BADGE_SIZE_PX}
          />
        ) : null}
      </View>
    </View>
  );
}

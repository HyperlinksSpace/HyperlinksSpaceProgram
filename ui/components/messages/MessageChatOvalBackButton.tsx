import { useState } from "react";
import { Platform, Pressable } from "react-native";
import {
  useColors,
  welcomeAuthButtonActiveBackground,
  welcomeAuthButtonHoverBackground,
} from "../../theme";
import { useTelegram } from "../Telegram";
import { MusicBackChevronIcon } from "../music/MusicControlIcons";

/** Matches archive / chat sticky header back chip. */
export const MESSAGE_CHAT_OVAL_BACK_BUTTON_PX = 30;
const CHEVRON_SIZE_PX = 16;

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
};

/** Circular undercover back control (chevron) for compact chat + archive headers. */
export function MessageChatOvalBackButton({ onPress, accessibilityLabel }: Props) {
  const colors = useColors();
  const { colorScheme } = useTelegram();
  const [hover, setHover] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onHoverIn={Platform.OS === "web" ? () => setHover(true) : undefined}
      onHoverOut={Platform.OS === "web" ? () => setHover(false) : undefined}
      hitSlop={6}
      style={({ pressed }) => {
        const webHover = Platform.OS === "web" && hover;
        let backgroundColor = colors.undercover;
        if (pressed) {
          backgroundColor = welcomeAuthButtonActiveBackground(colors, colorScheme);
        } else if (webHover) {
          backgroundColor = welcomeAuthButtonHoverBackground(colors, colorScheme);
        }
        return {
          width: MESSAGE_CHAT_OVAL_BACK_BUTTON_PX,
          height: MESSAGE_CHAT_OVAL_BACK_BUTTON_PX,
          borderRadius: MESSAGE_CHAT_OVAL_BACK_BUTTON_PX / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor,
          opacity: pressed ? 0.92 : 1,
          flexShrink: 0,
        };
      }}
    >
      <MusicBackChevronIcon color={colors.primary} size={CHEVRON_SIZE_PX} />
    </Pressable>
  );
}

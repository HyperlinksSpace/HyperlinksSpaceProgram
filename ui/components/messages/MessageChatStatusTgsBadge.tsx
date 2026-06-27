import { View } from "react-native";

type Props = {
  size?: number;
};

/** Native fallback until TGS playback is wired for iOS/Android. */
export function MessageChatStatusTgsBadge({ size = 20 }: Props) {
  return <View style={{ width: size, height: size }} />;
}

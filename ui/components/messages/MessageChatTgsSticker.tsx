import { View } from "react-native";

type Props = {
  data: Uint8Array;
  widthPx: number;
  heightPx: number;
};

/** Native fallback until TGS playback is wired for iOS/Android. */
export function MessageChatTgsSticker({ widthPx, heightPx }: Props) {
  return <View style={{ width: widthPx, height: heightPx }} />;
}

import { Image } from "expo-image";
import { Pressable, ScrollView, View } from "react-native";
import { swapSampleTokenImages } from "./swapFormAssets";

type Props = {
  onPress?: () => void;
};

/** Horizontal row of five sample token icons (20×20, 5px gap). */
export function SwapSampleTokenStrip({ onPress }: Props) {
  const strip = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ height: 20, flexGrow: 0 }}
      contentContainerStyle={{ flexDirection: "row", alignItems: "center" }}
      scrollEnabled={onPress == null}
    >
      {swapSampleTokenImages.map((src, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "center" }}>
          {index > 0 ? <View style={{ width: 5 }} /> : null}
          <Image source={src} style={{ width: 20, height: 20 }} contentFit="contain" />
        </View>
      ))}
    </ScrollView>
  );

  if (onPress == null) {
    return strip;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      {strip}
    </Pressable>
  );
}

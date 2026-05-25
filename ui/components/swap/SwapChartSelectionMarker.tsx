import { StyleSheet, View } from "react-native";

const DOT_SIZE = 5;
const STROKE_WIDTH = 1.33;

/** 5×5 marker on the selected point (filled + stroked; circular for pointer feedback). */
export function SwapChartSelectionMarker({
  x,
  y,
  fillColor,
  strokeColor,
}: {
  x: number;
  y: number;
  fillColor: string;
  strokeColor: string;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.marker,
        {
          left: x - DOT_SIZE / 2,
          top: y - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          backgroundColor: fillColor,
          borderColor: strokeColor,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  marker: {
    position: "absolute",
    borderWidth: STROKE_WIDTH,
    borderRadius: DOT_SIZE / 2,
  },
});

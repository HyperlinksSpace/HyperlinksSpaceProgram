import { View } from "react-native";

/** Selection radio for wallet picker rows (far right). */
export function WalletChoiceRadio({
  selected,
  color,
}: {
  selected: boolean;
  color: string;
}) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1.5,
        borderColor: selected ? color : "rgba(128,128,128,0.45)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {selected ? (
        <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: color }} />
      ) : null}
    </View>
  );
}

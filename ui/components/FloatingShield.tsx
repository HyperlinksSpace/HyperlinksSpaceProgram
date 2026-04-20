import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { layout, useColors } from "../theme";

const SHIELD_ICON = require("../../assets/Shield.svg");
const SETTINGS_ICON = require("../../assets/Settings.svg");

export function FloatingShield() {
  const colors = useColors();

  return (
    <View pointerEvents="none" style={[styles.host, { bottom: layout.bottomBar.barMinHeight + 20 }]}>
      <View
        style={[
          styles.settingsCircle,
          { backgroundColor: colors.undercover, borderColor: colors.highlight },
        ]}
      >
        <Image source={SETTINGS_ICON} style={styles.settingsIcon} contentFit="contain" />
      </View>
      <View
        style={[styles.circle, { backgroundColor: colors.undercover, borderColor: colors.highlight }]}
      >
        <Image source={SHIELD_ICON} style={styles.icon} contentFit="contain" />
        <Text style={[styles.label, { color: colors.primary }]}>Shield</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    right: 30,
    zIndex: 1000,
    elevation: 1000,
    alignItems: "flex-end",
  },
  settingsCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 10,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsIcon: {
    width: 20,
    height: 20,
  },
  circle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: "center",
  },
  icon: {
    width: 20,
    height: 22,
    marginTop: 6,
  },
  label: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 10,
    fontWeight: "400",
  },
});

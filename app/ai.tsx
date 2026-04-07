import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";

export default function AiScreen() {
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI</Text>
      {prompt ? (
        <Text style={styles.prompt}>Prompt: {prompt}</Text>
      ) : (
        <Text style={styles.hint}>No prompt</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: "flex-start",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  prompt: {
    fontSize: 14,
    color: "#333",
  },
  hint: {
    fontSize: 14,
    color: "#888",
  },
});

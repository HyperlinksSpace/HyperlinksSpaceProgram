import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { useColors } from "../../ui/theme";

export default function AiScreen() {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }

  const colors = useColors();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.primary }]}>AI</Text>
      {prompt ? (
        <Text style={[styles.prompt, { color: colors.primary }]}>Prompt: {prompt}</Text>
      ) : (
        <Text style={[styles.hint, { color: colors.secondary }]}>No prompt</Text>
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
  },
  hint: {
    fontSize: 14,
  },
});

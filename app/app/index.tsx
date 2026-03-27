import { Text, View } from "react-native";
import { useTelegram } from "./components/Telegram";

export default function Index() {
  const { status, telegramUsername, error, debug } = useTelegram();

  if (status === "idle" || status === "loading") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16 }}>
        <Text style={{ marginBottom: 12 }}>Loading…</Text>
        <View style={{ padding: 8, backgroundColor: "#f0f0f0", borderRadius: 8, alignSelf: "stretch" }}>
          <Text style={{ fontSize: 12, fontWeight: "600" }}>Debug</Text>
          <Text style={{ fontSize: 11 }}>hasWebApp: {String(debug.hasWebApp)}</Text>
          <Text style={{ fontSize: 11 }}>webAppPoll: {debug.webAppPollCount}</Text>
          <Text style={{ fontSize: 11 }}>initData: {debug.initDataLength != null ? debug.initDataLength : "—"}</Text>
          <Text style={{ fontSize: 11 }}>pollCount: {debug.pollCount}</Text>
          <Text style={{ fontSize: 11 }}>api: {debug.apiStatus ?? "—"} {debug.apiMessage ?? ""}</Text>
          {debug.apiUrl != null && <Text style={{ fontSize: 10 }}>url: {debug.apiUrl}</Text>}
          {debug.fetchDurationMs != null && <Text style={{ fontSize: 11 }}>fetchMs: {debug.fetchDurationMs}</Text>}
          {debug.lastLog != null && <Text style={{ fontSize: 11 }}>lastLog: {debug.lastLog}</Text>}
        </View>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
        }}
      >
        <Text style={{ fontWeight: "600", marginBottom: 8 }}>
          Telegram registration failed
        </Text>
        <Text style={{ textAlign: "center", marginBottom: 12 }}>{error}</Text>
        <View style={{ marginTop: 8, padding: 8, backgroundColor: "#f0f0f0", borderRadius: 8, alignSelf: "stretch" }}>
          <Text style={{ fontSize: 12, fontWeight: "600" }}>Debug</Text>
          <Text style={{ fontSize: 11 }}>hasWebApp: {String(debug.hasWebApp)} · initData: {debug.initDataLength ?? "—"}</Text>
          <Text style={{ fontSize: 11 }}>api: {debug.apiStatus ?? "—"} {debug.apiMessage ?? ""}</Text>
          {debug.apiUrl != null && <Text style={{ fontSize: 10 }}>url: {debug.apiUrl}</Text>}
          {debug.fetchDurationMs != null && <Text style={{ fontSize: 11 }}>fetchMs: {debug.fetchDurationMs}</Text>}
          {debug.lastLog != null && <Text style={{ fontSize: 11 }}>lastLog: {debug.lastLog}</Text>}
        </View>
      </View>
    );
  }

  if (status === "dev") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
        }}
      >
        <Text style={{ fontWeight: "600", marginBottom: 8 }}>
          Hyperlinks Space App
        </Text>
        <Text style={{ textAlign: "center", marginBottom: 12 }}>
          Outside Telegram, authentication abandoned.
        </Text>
        <View style={{ marginTop: 8, padding: 8, backgroundColor: "#f0f0f0", borderRadius: 8, alignSelf: "stretch" }}>
          <Text style={{ fontSize: 12, fontWeight: "600" }}>Debug</Text>
          <Text style={{ fontSize: 11 }}>hasWebApp: {String(debug.hasWebApp)}</Text>
          <Text style={{ fontSize: 11 }}>webAppPoll: {debug.webAppPollCount}</Text>
          <Text style={{ fontSize: 11 }}>initData: {debug.initDataLength != null ? debug.initDataLength : "—"}</Text>
          <Text style={{ fontSize: 11 }}>api: {debug.apiStatus ?? "—"} {debug.apiMessage ?? ""}</Text>
          {debug.apiUrl != null && <Text style={{ fontSize: 10 }}>url: {debug.apiUrl}</Text>}
          {debug.fetchDurationMs != null && <Text style={{ fontSize: 11 }}>fetchMs: {debug.fetchDurationMs}</Text>}
          {debug.lastLog != null && <Text style={{ fontSize: 11 }}>lastLog: {debug.lastLog}</Text>}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
      }}
    >
      <Text style={{ fontWeight: "600", marginBottom: 8 }}>
        HyperlinksSpace Wallet
      </Text>
      {telegramUsername && (
        <Text style={{ textAlign: "center" }}>
          You are logged in via Telegram as @{telegramUsername}.
        </Text>
      )}
    </View>
  );
}


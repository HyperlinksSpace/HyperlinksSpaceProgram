/** Wall-clock label for chat list rows and chat headers (HH:mm). */
export function formatMessageChatWallClock(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = raw < 12_000_000_000 ? raw * 1000 : raw;
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
  }
  if (typeof raw === "string" && raw.trim()) {
    const t = raw.trim();
    const d = new Date(t.includes("T") ? t : t.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
  }
  return "";
}

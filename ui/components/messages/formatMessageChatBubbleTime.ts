/** Bubble timestamp (e.g. 9.18 AM) for chat message undercover. */
export function formatMessageChatBubbleTime(raw: unknown): string {
  if (raw == null || raw === "") return "";
  let d: Date;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    d = new Date(raw < 12_000_000_000 ? raw * 1000 : raw);
  } else if (typeof raw === "string" && raw.trim()) {
    const t = raw.trim();
    d = new Date(t.includes("T") ? t : t.replace(" ", "T"));
  } else {
    return "";
  }
  if (Number.isNaN(d.getTime())) return "";
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${h12}.${String(minutes).padStart(2, "0")} ${ampm}`;
}

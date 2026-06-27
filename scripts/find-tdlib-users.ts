import "dotenv/config";
import { searchChatsForUser, searchContactsForUser } from "../telegram/tdlib/connectAttempts.js";

const TELEGRAM_USERNAME = "google_101588329969381409831";
const QUERIES = ["Андрей", "Andrey", "Gennadyevich", "Gennagevech", "Gennad", "Gennadyevich"];

async function main(): Promise<void> {
  for (const query of QUERIES) {
    const contacts = await searchContactsForUser(TELEGRAM_USERNAME, query);
    for (const row of contacts) {
      console.log(JSON.stringify({ kind: "contact", query, ...row }));
    }
    const chats = await searchChatsForUser(TELEGRAM_USERNAME, query);
    for (const row of chats) {
      console.log(JSON.stringify({ kind: "chat", query, ...row }));
    }
  }
}

void main();

import type { Client } from "tdl";
import {
  isChatInArchiveList,
  isChatInFolderList,
  isChatInMainList,
  type TdChat,
} from "./chatPreview.js";
import { resolveMyUserId } from "./chatHistory.js";

/** Open (or create) the private self-chat used as Saved Messages. */
export async function ensureSavedMessagesChat(client: Client): Promise<TdChat | null> {
  const myId = await resolveMyUserId(client);
  if (myId == null || myId <= 0) return null;
  try {
    let chat = (await client.invoke({
      _: "createPrivateChat",
      user_id: Math.trunc(myId),
      force: true,
    })) as TdChat;
    const positioned =
      isChatInMainList(chat) || isChatInArchiveList(chat) || isChatInFolderList(chat);
    if (!positioned && typeof chat.id === "number" && chat.id !== 0) {
      try {
        await client.invoke({
          _: "addChatToList",
          chat_id: chat.id,
          chat_list: { _: "chatListMain" },
        });
        chat = (await client.invoke({ _: "getChat", chat_id: chat.id })) as TdChat;
      } catch {
        /* already listed or TDLib rejected — keep createPrivateChat result */
      }
    }
    return chat;
  } catch {
    return null;
  }
}

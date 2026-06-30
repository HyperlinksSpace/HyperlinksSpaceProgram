Not implemented (optional)
getRecentEmojiStatuses and getThemedChatEmojiStatuses are for suggested / trending status pickers, not for showing another user’s current badge. They would only matter if you add a “set my emoji status” UI inside the app.

After redeploying the TDLib gateway, peer emoji statuses in chat rows and headers should track Telegram in real time via the same getCustomEmojiStickers → download → TGS/WebM path as inline message emojis.
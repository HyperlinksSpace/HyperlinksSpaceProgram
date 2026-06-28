# Telegram profile music — export, API access & in-app playback

Research note for **Hyperlinks Space Program (HSP)**: whether music pinned on a **Telegram profile** can be **exported** as a playlist and **played inside HSP**, and what is technically and legally feasible.

**Related HSP docs:**

- [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) — TMA vs TDLib user session
- [`tdlib-build-your-own-telegram-messages-and-token-analytics.md`](tdlib-build-your-own-telegram-messages-and-token-analytics.md) — TDLib gateway pattern
- [`telegram-gifts-integration-research.md`](telegram-gifts-integration-research.md) — same **Client API / not Bot API** constraint as gifts

**External references:**

- [users.getSavedMusic](https://core.telegram.org/method/users.getSavedMusic) — MTProto, layer 213+
- [account.saveMusic](https://core.telegram.org/method/account.saveMusic) — add / remove / reorder profile tracks
- [users.SavedMusic](https://core.telegram.org/type/users.SavedMusic) — type definition
- [TDLib issue #3432](https://github.com/tdlib/td/issues/3432) — profile music API added in **TDLib 1.8.55**
- [Telegram blog — profile music](https://telegram.org/blog/profile-music-gift-themes)

---

## 1) Executive summary

| Question | Answer |
|----------|--------|
| Is there an official **“Export playlist”** button in Telegram? | **No.** Profile music is not exported as M3U, Spotify, or Apple Music playlists. |
| Can I **read** the profile track list programmatically? | **Yes**, via **MTProto Client API** (`users.getSavedMusic`, `users.getSavedMusicByID`) with a **user session** (TDLib / Telethon). **Not** via Bot API or Mini App `initData` alone. |
| Can I **download** the audio files? | **Partially.** Tracks are **`Document`** objects in Telegram’s CDN. You can obtain **file references** and download bytes **through an authenticated client**, subject to **expiring references**, **rate limits**, and **Terms of Service**. |
| Can HSP **play** them in the app? | **Technically possible** for **your own** profile music (and possibly **public** profile music of other users — verify per-method access rules). **Product/legal risk:** many profile tracks are **licensed catalog music**, not user-owned files; redistributing streams outside official Telegram clients may violate **Telegram ToS** and **copyright**. |
| Practical recommendation | Treat profile music as **Telegram-native UX** (deep link to Telegram / in-app TDLib player using Telegram CDN), not as a portable playlist you own. For **your** music library, prefer **user-uploaded files**, **Spotify/Apple OAuth**, or **local files** with clear licensing. |

---

## 2) What “profile music” is on Telegram

Telegram’s **Profile → Music** tab lets users pin tracks from Telegram’s **music catalog** (and related document types) to their profile. Other users can preview/play from the profile inside Telegram.

Conceptually:

```
User profile
     │
     ▼
users.getSavedMusic  →  ordered list of Document ids + metadata
     │
     ▼
messages.getDocument / download  →  audio bytes on Telegram CDN (session + file_reference)
```

This is **not** the same as:

- A ** Spotify playlist** you own.
- **Voice messages** or **MP3 files** sent in a chat (different flows).
- **Bot API** `sendAudio` uploads (bots cannot read profile music).

---

## 3) API surface (Client API / TDLib)

Available from **layer 213** (“Music in profile”):

| Method | Purpose |
|--------|---------|
| `users.getSavedMusic` | List songs pinned on a user’s profile (pagination: `offset`, `limit`, `hash` for cache). |
| `users.getSavedMusicByID` | Refresh **file references** for specific documents; check if still pinned. |
| `account.saveMusic` | **Mutate** own profile: add track, remove (`unsave`), reorder (`after_id`). |

**TDLib:** corresponding `td_api` types were added in **1.8.55** ([scheme reference](https://github.com/tdlib/td/blob/master/td/generate/scheme/td_api.tl) — search `savedMusic` / profile music).

**What is NOT available:**

- No **`exportSavedMusic`** or standard **JSON/CSV playlist export**.
- No **Bot API** methods for profile music.
- No documented **Mini App JavaScript SDK** for reading another user’s pinned tracks without a backend TDLib session.

---

## 4) Can you “export” the playlist?

### 4.1 Official Telegram Desktop export

**Settings → Advanced → Export Telegram data** exports **chats**, **media in chats**, etc. It does **not** provide a dedicated **profile music playlist** export format comparable to chat history export. Do not rely on Desktop export for this feature.

### 4.2 Programmatic extraction (TDLib / MTProto)

Feasible **internal** pipeline for HSP (same gateway model as gifts/messages):

```
┌──────────────┐     TDLib user session      ┌─────────────────┐
│  HSP client  │ ──────────────────────────► │  TDLib gateway  │
└──────────────┘                               └────────┬────────┘
                                                        │
                        users.getSavedMusic             │
                        users.getSavedMusicByID         ▼
                                               List<Document> + order
                                                        │
                        downloadFile (optional)         ▼
                                               Local cache / stream URL
```

**Steps:**

1. Authenticate **as the user** whose profile music you read (for **own** library) or call `users.getSavedMusic` with **`id: InputUser`** for **another** profile (confirm allowed for non-contacts in current layer docs).
2. Parse each **`document`** — title, performer, duration, `file_reference`, access hash.
3. Optionally **`downloadFile`** to app cache or stream via TDLib’s file API.
4. Build an **app-internal playlist** model (order preserved from API).

**Output formats you can build yourself (not official):**

| Format | Feasibility |
|--------|-------------|
| HSP in-app queue | Yes — store document ids + metadata |
| Local files on disk | Yes — if download succeeds; **licensing** unclear |
| M3U / PLS | Possible as **metadata-only** or local paths — **not** portable to other apps without files |
| Spotify / Apple Music sync | **No** direct API — would need separate OAuth + manual matching |

There is **no** one-click “export to Spotify.”

---

## 5) Playing music through HSP

### 5.1 Architecture options

| Option | Pros | Cons |
|--------|------|------|
| **A. Deep link to Telegram** | Zero licensing risk; official player | Leaves HSP |
| **B. TDLib stream in WebView/native player** | Stays in app; uses Telegram CDN URLs from TDLib | Needs always-on session; file refs expire; ToS/copyright |
| **C. Cache downloaded files locally** | Offline playback | Storage; copyright; ref refresh |
| **D. User-owned sources** (upload / Spotify) | Clean licensing story | Not “profile music export” |

### 5.2 HSP integration pattern (if product approves)

Mirror [`telegram-gifts-integration-research.md`](telegram-gifts-integration-research.md):

1. **Identity** — existing Telegram Login / TMA `initData` for *who* the user is.
2. **Capability** — separate **TDLib user session** (encrypted session store on server or device) for `users.getSavedMusic`.
3. **UI** — “Profile music” section: list tracks, play/pause, link “Manage in Telegram” for add/remove (or call `account.saveMusic` from gateway).
4. **Playback** — use TDLib `downloadFile` + platform audio APIs; refresh with `users.getSavedMusicByID` when playback fails (expired reference).

**Bot API / TMA alone:** insufficient for read or play.

### 5.3 Third-party scripts

Community tools (e.g. batch adders using Pyrogram/Telethon) **add** channel audio **to** profile via `account.saveMusic`; they do not constitute an official export. Useful as proof that **Client API** control exists, not as a licensing model for HSP.

---

## 6) Limits, risks, and compliance

### 6.1 Technical limits

- **File references expire** — must refresh via `getSavedMusicByID` or refetch list.
- **Rate limits** — bulk download looks like scraping; throttle and cache.
- **Not all documents are plain MP3** — handle mime types and player codecs.
- **Premium / region** — catalog availability may vary; API may return partial lists.

### 6.2 Legal and product risks

- Profile tracks often come from **Telegram’s licensed catalog**. Streaming outside official clients may breach **Telegram Terms of Service** and **rightsholder licenses**.
- **Exporting files** to disk and re-serving them from **your CDN** is higher risk than **streaming through TDLib** to the same user who authenticated.
- **Other users’ profiles:** playing their pinned music in HSP may be allowed for preview (similar to Telegram client) but **bulk export** of another user’s list is ethically and legally sensitive.

**Recommendation:** legal review before shipping; default to **playback for authenticated owner only**; show **attribution** (title, artist); no permanent re-hosting.

### 6.3 Privacy

- Profile music reveals taste / identity signals — treat as **sensitive profile data** in logs and analytics.

---

## 7) Comparison: what users might expect vs reality

| User expectation | Reality |
|------------------|---------|
| “Download my Telegram playlist as MP3 zip” | Not supported officially; programmatic download is **session-bound** and **legally constrained** |
| “Import profile music into HSP like Spotify” | Build **custom integration** via TDLib; no standard import format |
| “Play my profile music in HSP” | **Possible** with TDLib + audio player; **not** with Bot API |
| “Sync when I change profile in Telegram” | Poll `getSavedMusic` with `hash` / periodic refresh |

---

## 8) Suggested HSP roadmap (if feature is approved)

| Phase | Scope |
|-------|--------|
| **P0 — Read-only** | TDLib gateway: `users.getSavedMusic` for **current user**; display list in profile UI |
| **P1 — Playback** | Stream via TDLib; handle ref refresh; in-app mini player |
| **P2 — Manage** | `account.saveMusic` for add/remove/reorder (or defer to Telegram deep link) |
| **P3 — Others’ profiles** | View/public preview on friend profile pages — **only** if API + legal allow |
| **Not recommended** | Mass export to files; re-host on HSP CDN; Spotify sync without partnerships |

---

## 9) Direct answers

**Can I export the playlist?**  
Not through an official export. You can **enumerate** pinned tracks with **`users.getSavedMusic`** and optionally **download** documents via a **Client API** session — that is a **custom export**, not a portable standard playlist, and may not comply with Telegram or music licensing for redistribution.

**Can I play it through my app?**  
**Yes, with TDLib (or equivalent MTProto user session)** and an in-app audio player, for users who link Telegram at Client API depth — similar to how HSP would integrate gifts. **No** with Bot API or TMA identity alone. Ship only after **legal** clearance on streaming catalog tracks outside the official Telegram apps.

---

## 10) Open questions for product

- Is the goal **own profile only** or **social discovery** (others’ profile music)?
- Acceptable fallback when TDLib session missing: hide feature vs “Open in Telegram”?
- Partnership vs **bring-your-own audio** (uploads, Spotify) for a sustainable music product inside HSP.

/**
 * Hyperlinks Space Program help chunks for TinyModel `/v1/retrieve`.
 * Keep in sync with TinyModel `texts/hsp_program_corpus.md`.
 */
const CORPUS_MD = `# Hyperlinks Space Program — in-app help corpus (RAG)

Chunks are delimited by \`##\` headings. Used by TinyModel hybrid retrieval and synced into Hyperlinks Space Program \`ai/hspProgramCorpus.ts\`. Regenerate HSP chunks when this file changes.

## AI and Search (GlobalBottomBar)

The bottom bar on the signed-in home screen is labeled **AI & Search** (web) or **AI & Search** on native. Type a question or tap a premade prompt. Sending opens the AI flow with your text. The bar supports multiline input and appears in the screen footer on narrow layouts or in the far-right column on wide layouts. Premade examples include trending tokens, artist launches, and swap-style requests.

## Swap tokens

Open **Swap** from the main navigation to exchange tokens on TON. The swap screen shows charts, currency selection, and rate information powered by Swap.Coffee. Use the bottom bar to ask for help comparing rates, slippage, or which token to pick—always confirm amounts on screen before submitting a swap.

## Send and Get wallet

**Send** moves assets from your wallet; **Get** shows receive / wallet details. Wallet creation and key backup flows are security-sensitive. The program may prompt you to save a recovery phrase. Use AI to explain steps, not to paste private keys or mnemonics into chat.

## Sign in and accounts

Welcome supports sign-in providers such as **Google**, **GitHub**, and **Telegram** (availability may vary by platform). Link accounts from settings when offered. After sign-in you reach the authenticated home with feed, swap, and the AI bar. If login fails, check network, API base URL (\`EXPO_PUBLIC_API_BASE_URL\`), and server OAuth env configuration.

## Shield

**Shield** is the program’s protection / settings entry (floating control and related screens). Use it for security-oriented options. Ask the assistant to explain Shield on your current screen; it should not ask for secrets.

## Connect Telegram messages

From the home footer you can **Connect Telegram** to link real Telegram message access via the TDLib gateway (server-side \`TELEGRAM_API_ID\`, \`TELEGRAM_API_HASH\`, and \`TDLIB_GATEWAY_URL\`). Local dev runs \`npm run tdlib:gateway\` and points the API at your tunnel or localhost. Disconnect clears the linked session when available.

## Feed

The home **feed** shows activity-style items (tasks, tokens, NFTs, wallet events—placeholders and live items may mix). Time and translations follow UI locale settings. AI can summarize feed wording or explain item types; it does not execute trades from feed cards alone.

## Smart layout

On wide viewports, **Smart** content may open in a right panel; on narrow screens use the Smart route. Layout breakpoints are defined in the UI theme (\`authenticatedHome.firstBreakpoint\`). The AI column can show search empty-state prompts when the draft is empty.

## Token info mode

When you ask about a **token symbol** (e.g. USDT, TON, NOT), the backend may run **token_info** mode: live facts from Swap.Coffee (price, holders, verification) plus a concise analyst-style answer. Prefer symbols like USDT or $USDT for detection. If a token is not found on TON, you will get a clear not-found message.

## Languages

The UI supports **English** and **Russian** via in-app locale toggles. AI replies can follow your phrasing; ask for answers in a specific language in the same message. Feed welcome translation may follow UI language when the manual toggle is enabled.

## Windows and Telegram Mini App

The same codebase ships as **Expo web**, **Telegram Mini App**, and **Windows Electron**. Telegram Mini App uses theme colors from the WebApp API. Windows builds use Electron Forge; in-app updates are documented under windows installer notes. API calls go to your deployed \`/api/*\` routes (e.g. Vercel) or local \`npm run dev:vercel\`.

## Getting help safely

Do not share seed phrases, private keys, or full payment card numbers in AI chat. For billing on third-party services (OpenAI, Neon, Vercel), use official dashboards. Report bugs via the project GitHub repository. AI augments the UI—it does not replace on-screen confirmation for sends and swaps.
`;

export function loadHspProgramChunks(markdown: string = CORPUS_MD): string[] {
  const parts = markdown.split(/^##\s+(.+)$/gm);
  const chunks: string[] = [];
  for (let idx = 1; idx < parts.length; idx += 2) {
    if (idx + 1 >= parts.length) break;
    const title = parts[idx]?.trim() ?? "";
    const body = parts[idx + 1]?.trim() ?? "";
    if (body) {
      chunks.push(`${title}\n${body}`);
    }
  }
  return chunks.length > 0 ? chunks : [markdown.trim()];
}

/** Default retrieval candidates for TinyModel sidecar. */
export const HSP_PROGRAM_CORPUS_CHUNKS: readonly string[] = loadHspProgramChunks();

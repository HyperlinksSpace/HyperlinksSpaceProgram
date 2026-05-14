/**
 * Central UI copy: English and Russian in one module.
 * Keys: `feature.area.name`. Use {@link getAppString} / {@link formatAppString} / `useAppStrings().t`.
 */

export type AppLocale = "en" | "ru";

export const APP_LOCALES: readonly AppLocale[] = ["en", "ru"] as const;

export const APP_LOCALE_DEFAULT: AppLocale = "en";

const en = {
  "ai.noPrompt": "No prompt",
  "ai.promptPrefix": "Prompt:",
  "ai.title": "AI",

  "common.debug": "Debug",
  "common.emDash": "—",
  "common.loading": "Loading…",

  "debug.api": "api:",
  "debug.fetchMs": "fetchMs:",
  "debug.hasWebAppLine": "hasWebAppApi: {{has}} · inTelegram: {{in}}",
  "debug.initData": "initData:",
  "debug.initDataPoll": "initDataPoll:",
  "debug.initDataPollNoteError":
    "initDataPoll only runs when Telegram launch or real WebApp platform is detected; otherwise we stop (no infinite polling outside Telegram).",
  "debug.initDataPollNoteLoading":
    "initDataPoll only runs when a Telegram launch or real WebApp platform is detected; otherwise we stop (no infinite poll outside Telegram).",
  "debug.lastLog": "lastLog:",
  "debug.url": "url:",
  "debug.webAppInitLine": "webAppApiPoll: {{web}} · initDataPoll: {{init}}",
  "debug.webAppPollLine": "webAppApiPoll: {{count}}",

  "feed.empty": "No feed items yet.",
  "feed.offlinePreview": "(offline preview)",
  "feed.placeholder.creatorSubtitle": "Press to access creators page",
  "feed.placeholder.creatorTitle": "You are likely a creator",
  "feed.placeholder.nftSubtitle": "$24",
  "feed.placeholder.nftTitle": "NFT recieved",
  "feed.placeholder.nftTrailing": "NFT recieved",
  "feed.placeholder.taskSubtitle": "$24",
  "feed.placeholder.taskTitle": "Incoming task",
  "feed.placeholder.tokenSubtitle": "$1",
  "feed.placeholder.tokenTitle": "Token granted",
  "feed.placeholder.tokenTrailing": "+1 DLLR",
  "feed.placeholder.walletSubtitle": "Press to save 24 words",
  "feed.placeholder.walletTitle": "Wallet created",
  "feed.timePending": "--:--",

  "floating.shield.label": "Shield",

  "global.bottomBar.placeholderNative": "AI & Search",
  "global.bottomBar.placeholderWeb": "AI and search",
  "global.bottomBar.premade1": "What is the universe?",
  "global.bottomBar.premade2": "Tell me about dogs token",

  "global.logoBar.about": "About",
  "global.logoBar.aboutHint": "Opens the Hyperlinks Space Program landing page in the browser",
  "global.logoBar.wordmarkA11y": "Hyperlinks Space",

  "home.dev.outsideTelegram": "Outside Telegram, authentication abandoned.",
  "home.dev.productTitle": "Hyperlinks Space Program",

  "home.errors.telegramRegistrationFailed": "Telegram registration failed",

  "home.header.iconCopy": "Copy wallet address",
  "home.header.iconEdit": "Edit",
  "home.header.iconExit": "Exit",
  "home.header.iconKey": "Key",
  "home.header.iconLanguage": "Language",
  "home.header.languageIconSwitchToEn": "Switch interface to English",
  "home.header.languageIconSwitchToRu": "Switch interface to Russian",
  "home.header.balanceA11y": "Balance",
  "home.header.copyWalletHint": "Copies the full wallet address",
  "home.header.walletAddressA11y": "Wallet address {{snippet}}",

  "home.menu.deals": "Deals",
  "home.menu.get": "Get",
  "home.menu.send": "Send",
  "home.menu.swap": "Swap",
  "home.menu.trade": "Trade",

  "home.nav.coins": "Coins",
  "home.nav.feed": "Feed",
  "home.nav.items": "Items",
  "home.nav.messages": "Messages",
  "home.nav.tasks": "Tasks",

  "home.wallet.backupKmsNote":
    "Wallet backup is stored encrypted on the server (wrapped key in Google Cloud KMS).",
  "home.wallet.errorMissingInitData": "Missing Telegram initData.",
  "home.wallet.errorRegistrationFailed": "Wallet registration failed",
  "home.wallet.errorRegistrationPollTimeout":
    "Wallet registration: could not reach the app or the server in time. Try again, or open the app once more (your wallet may already be saved).",
  "home.wallet.errorRegistrationRequestFailed": "Wallet registration request failed",
  "home.wallet.errorRegistrationRequestTimedOut": "Wallet registration request timed out",
  "home.wallet.errorServerBusy":
    "Wallet server timed out (busy or cold). Tap Retry, or try again in a few seconds.",
  "home.wallet.errorSetupBudget":
    "Wallet setup is taking too long. Check your connection, update Telegram, or try again.",
  "home.wallet.errorWalletKeyGenerationSlow":
    "Wallet key generation is taking too long. Update Telegram, try a different client, or tap Retry.",
  "home.wallet.finishingServer":
    "Finishing on the server (saving the row). You can wait or close the app; your address is already shown.",
  "home.wallet.generatingKeys": "Generating your wallet keys…",
  "home.wallet.loggedInAs": "You are logged in via Telegram as @{{username}}.",
  "home.wallet.retryServerRegistration": "Retry server registration",
  "home.wallet.retryWalletCreation": "Retry wallet creation",

  "key.header.goHomeA11y": "Go to home",

  "ota.later": "Later",
  "ota.message": "A new version has been downloaded. Restart now to apply it?",
  "ota.restart": "Restart",
  "ota.title": "Update ready",

  "welcome.auth.emailInvalid": "Invalid email",
  "welcome.auth.emailPlaceholder": "Your email address",
  "welcome.auth.signInApple": "Sign in with Apple",
  "welcome.auth.signInButton": "Sign in",
  "welcome.auth.signInEmailTitle": "Sign in with email",
  "welcome.auth.signInGithub": "Sign in with GitHub",
  "welcome.auth.signInGoogle": "Sign in with Google",
  "welcome.auth.signInTelegram": "Sign in with Telegram",
  "welcome.auth.telegramBrowserAlertMessage":
    "Open this page inside the Telegram app to continue, or use a normal web browser (not an in-app preview that mimics Telegram).",
  "welcome.auth.telegramBrowserAlertTitle": "Sign in with Telegram",
  "welcome.auth.telegramStartError": "Could not start Telegram sign-in. Try again.",

  "welcome.subtitle": "This is the best way to earn and spend",
  "welcome.title": "Welcome to our program",
} as const;

const ru = {
  "ai.noPrompt": "Нет запроса",
  "ai.promptPrefix": "Запрос:",
  "ai.title": "ИИ",

  "common.debug": "Отладка",
  "common.emDash": "—",
  "common.loading": "Загрузка…",

  "debug.api": "api:",
  "debug.fetchMs": "fetchMs:",
  "debug.hasWebAppLine": "hasWebAppApi: {{has}} · inTelegram: {{in}}",
  "debug.initData": "initData:",
  "debug.initDataPoll": "initDataPoll:",
  "debug.initDataPollNoteError":
    "initDataPoll запускается только при запуске из Telegram или реальной платформе WebApp; иначе опрос останавливается (бесконечного опроса вне Telegram нет).",
  "debug.initDataPollNoteLoading":
    "initDataPoll запускается только при запуске из Telegram или реальной платформе WebApp; иначе опрос останавливается (бесконечного опроса вне Telegram нет).",
  "debug.lastLog": "lastLog:",
  "debug.url": "url:",
  "debug.webAppInitLine": "webAppApiPoll: {{web}} · initDataPoll: {{init}}",
  "debug.webAppPollLine": "webAppApiPoll: {{count}}",

  "feed.empty": "Пока нет записей в ленте.",
  "feed.offlinePreview": "(просмотр без сети)",
  "feed.placeholder.creatorSubtitle": "Нажмите, чтобы открыть страницу для авторов",
  "feed.placeholder.creatorTitle": "Вероятно, вы автор",
  "feed.placeholder.nftSubtitle": "$24",
  "feed.placeholder.nftTitle": "NFT получен",
  "feed.placeholder.nftTrailing": "NFT получен",
  "feed.placeholder.taskSubtitle": "$24",
  "feed.placeholder.taskTitle": "Входящее задание",
  "feed.placeholder.tokenSubtitle": "$1",
  "feed.placeholder.tokenTitle": "Выдан токен",
  "feed.placeholder.tokenTrailing": "+1 DLLR",
  "feed.placeholder.walletSubtitle": "Нажмите, чтобы сохранить 24 слова",
  "feed.placeholder.walletTitle": "Кошелёк создан",
  "feed.timePending": "--:--",

  "floating.shield.label": "Щит",

  "global.bottomBar.placeholderNative": "ИИ и поиск",
  "global.bottomBar.placeholderWeb": "ИИ и поиск",
  "global.bottomBar.premade1": "Что такое Вселенная?",
  "global.bottomBar.premade2": "Расскажи про токен dogs",

  "global.logoBar.about": "О программе",
  "global.logoBar.aboutHint": "Откроет сайт программы Hyperlinks Space в браузере",
  "global.logoBar.wordmarkA11y": "Hyperlinks Space",

  "home.dev.outsideTelegram": "Вне Telegram вход недоступен.",
  "home.dev.productTitle": "Hyperlinks Space Program",

  "home.errors.telegramRegistrationFailed": "Ошибка регистрации в Telegram",

  "home.header.iconCopy": "Скопировать адрес кошелька",
  "home.header.iconEdit": "Изменить",
  "home.header.iconExit": "Выход",
  "home.header.iconKey": "Ключ",
  "home.header.iconLanguage": "Язык",
  "home.header.languageIconSwitchToEn": "Переключить интерфейс на английский",
  "home.header.languageIconSwitchToRu": "Переключить интерфейс на русский",
  "home.header.balanceA11y": "Баланс",
  "home.header.copyWalletHint": "Копирует полный адрес кошелька",
  "home.header.walletAddressA11y": "Адрес кошелька {{snippet}}",

  "home.menu.get": "Получить",
  "home.menu.swap": "Обмен",
  "home.menu.deals": "Сделки",
  "home.menu.trade": "Рынок",
  "home.menu.send": "Отправка",

  "home.nav.coins": "Монеты",
  "home.nav.feed": "Лента",
  "home.nav.items": "Предметы",
  "home.nav.messages": "Сообщения",
  "home.nav.tasks": "Задачи",

  "home.wallet.backupKmsNote":
    "Резервная копия кошелька хранится на сервере в зашифрованном виде (ключ в обёртке Google Cloud KMS).",
  "home.wallet.errorMissingInitData": "Отсутствуют данные initData Telegram.",
  "home.wallet.errorRegistrationFailed": "Не удалось зарегистрировать кошелёк",
  "home.wallet.errorRegistrationPollTimeout":
    "Не удалось связаться с приложением или сервером в отведённое время. Попробуйте снова или откройте приложение ещё раз (кошелёк мог уже сохраниться).",
  "home.wallet.errorRegistrationRequestFailed": "Запрос регистрации кошелька не выполнен",
  "home.wallet.errorRegistrationRequestTimedOut": "Истекло время запроса регистрации кошелька",
  "home.wallet.errorServerBusy":
    "Сервер кошелька не ответил вовремя (перегрузка или холодный старт). Нажмите «Повторить» или подождите несколько секунд.",
  "home.wallet.errorSetupBudget":
    "Настройка кошелька занимает слишком много времени. Проверьте соединение, обновите Telegram и попробуйте снова.",
  "home.wallet.errorWalletKeyGenerationSlow":
    "Генерация ключей кошелька занимает слишком много времени. Обновите Telegram, смените клиент или нажмите «Повторить».",
  "home.wallet.finishingServer":
    "Завершение на сервере (сохранение записи). Можно подождать или закрыть приложение — адрес уже показан.",
  "home.wallet.generatingKeys": "Генерация ключей кошелька…",
  "home.wallet.loggedInAs": "Вы вошли через Telegram как @{{username}}.",
  "home.wallet.retryServerRegistration": "Повторить регистрацию на сервере",
  "home.wallet.retryWalletCreation": "Повторить создание кошелька",

  "key.header.goHomeA11y": "На главную",

  "ota.later": "Позже",
  "ota.message": "Новая версия загружена. Перезапустить сейчас?",
  "ota.restart": "Перезапуск",
  "ota.title": "Обновление готово",

  "welcome.auth.emailInvalid": "Некорректный адрес",
  "welcome.auth.emailPlaceholder": "Ваш адрес электронной почты",
  "welcome.auth.signInApple": "Войти через Apple",
  "welcome.auth.signInButton": "Войти",
  "welcome.auth.signInEmailTitle": "Войти по электронной почте",
  "welcome.auth.signInGithub": "Войти через GitHub",
  "welcome.auth.signInGoogle": "Войти через Google",
  "welcome.auth.signInTelegram": "Войти через Telegram",
  "welcome.auth.telegramBrowserAlertMessage":
    "Откройте эту страницу в приложении Telegram или в обычном браузере (не во встроенном предпросмотре, который имитирует Telegram).",
  "welcome.auth.telegramBrowserAlertTitle": "Вход через Telegram",
  "welcome.auth.telegramStartError": "Не удалось начать вход через Telegram. Попробуйте снова.",

  "welcome.subtitle": "Лучший способ заработать и потратить",
  "welcome.title": "Добро пожаловать в нашу программу",
} satisfies { [K in keyof typeof en]: string };

export const appStrings = {
  en,
  ru,
} as const;

export type AppStringKey = keyof typeof en;

export function getAppString(locale: AppLocale, key: AppStringKey): string {
  const table = appStrings[locale] ?? appStrings[APP_LOCALE_DEFAULT];
  return table[key] ?? appStrings.en[key];
}

export function formatAppString(
  locale: AppLocale,
  key: AppStringKey,
  vars?: Record<string, string | number | boolean>,
): string {
  let s = getAppString(locale, key);
  if (!vars) return s;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{{${k}}}`).join(String(v));
  }
  return s;
}

/** Known English error copy from wallet flow → localized for display (state may stay English for logic). */
export function translateFlowErrorForDisplay(locale: AppLocale, message: string): string {
  const exact: Partial<Record<string, AppStringKey>> = {
    "Missing Telegram initData.": "home.wallet.errorMissingInitData",
    "Wallet registration failed": "home.wallet.errorRegistrationFailed",
    "Wallet registration request timed out": "home.wallet.errorRegistrationRequestTimedOut",
    "Wallet registration request failed": "home.wallet.errorRegistrationRequestFailed",
    "Wallet registration: could not reach the app or the server in time. Try again, or open the app once more (your wallet may already be saved).":
      "home.wallet.errorRegistrationPollTimeout",
    "Wallet server timed out (busy or cold). Tap Retry, or try again in a few seconds.":
      "home.wallet.errorServerBusy",
    "Wallet setup is taking too long. Check your connection, update Telegram, or try again.":
      "home.wallet.errorSetupBudget",
    "Wallet key generation is taking too long. Update Telegram, try a different client, or tap Retry.":
      "home.wallet.errorWalletKeyGenerationSlow",
  };
  const key = exact[message];
  if (key) return getAppString(locale, key);
  return message;
}

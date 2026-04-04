function normalizeVersion(raw: string): string {
  const v = raw.trim();
  if (!v) return "dev";
  if (/^[0-9a-f]{7,40}$/i.test(v)) return v.slice(0, 7);
  return v;
}

export function getBotVersion(): string {
  const raw =
    process.env.BOT_VERSION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.npm_package_version ??
    "dev";
  return normalizeVersion(raw);
}

export function buildStartMessage(): string {
  const version = getBotVersion();
  return `That's @HyperlinksSpaceBot v.${version}, you can use AI in bot and explore the app for more features`;
}


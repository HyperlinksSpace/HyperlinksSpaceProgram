/**
 * Create .vercel/output (Build Output API v3) so both static Expo app and api/bot are deployed.
 * Run after: npx expo export -p web && npx tsx scripts/set-webhook.ts
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.vercel', 'output');
const staticDir = path.join(out, 'static');
const funcDir = path.join(out, 'functions', 'api', 'bot.func');

// 1. .vercel/output/static <- dist
if (!fs.existsSync(path.join(root, 'dist'))) {
  console.error('[build-output] dist/ not found. Run expo export -p web first.');
  process.exit(1);
}
fs.mkdirSync(staticDir, { recursive: true });
copyDir(path.join(root, 'dist'), staticDir);

// 2. .vercel/output/config.json
const config = {
  version: 3,
  overrides: {
    'index.html': { path: '/' },
  },
};
fs.writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(config, null, 2)
);

// 3. .vercel/output/functions/api/bot.func (handler + deps)
fs.mkdirSync(funcDir, { recursive: true });

// api/bot.ts as index.ts (import from ./webhook)
const apiBot = fs.readFileSync(path.join(root, 'api', 'bot.ts'), 'utf8');
const indexContent = apiBot.replace(
  "from '../bot/webhook'",
  "from './webhook.js'"
);
fs.writeFileSync(path.join(funcDir, 'index.ts'), indexContent);

fs.copyFileSync(path.join(root, 'bot', 'webhook.ts'), path.join(funcDir, 'webhook.ts'));
fs.copyFileSync(path.join(root, 'bot', 'grammy-bot.ts'), path.join(funcDir, 'grammy-bot.ts'));

// .vc-config.json for Node.js serverless
const vcConfig = {
  runtime: 'nodejs20.x',
  handler: 'index.ts',
  launcherType: 'Nodejs',
  maxDuration: 30,
};
fs.writeFileSync(
  path.join(funcDir, '.vc-config.json'),
  JSON.stringify(vcConfig, null, 2)
);

// package.json so Vercel installs grammy in the function
const pkg = {
  name: 'api-bot',
  type: 'module',
  dependencies: { grammy: '^1.34.0' },
};
fs.writeFileSync(
  path.join(funcDir, 'package.json'),
  JSON.stringify(pkg, null, 2)
);

console.log('[build-output] Created .vercel/output (static + api/bot.func)');

function copyDir(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

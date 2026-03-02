import { ensureSchema } from '../api/db';

async function main() {
  try {
    console.log('[db] Running schema migrations against DATABASE_URL...');
    await ensureSchema();
    console.log('[db] Schema is up to date.');
  } catch (err) {
    console.error('[db] Migration failed', err);
    process.exitCode = 1;
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();


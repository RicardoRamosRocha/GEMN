import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error('Vercel precisa definir EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
}

if (new URL(supabaseUrl).hostname === 'lfsbjynpsgcvdtaeotho.supabase.co') {
  throw new Error('Build bloqueado: a URL do Supabase DEV não pode ser usada na publicação.');
}

const expoCli = require.resolve('expo/bin/cli');
const result = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'web', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, EXPO_NO_DOTENV: '1' },
  cwd: resolve(process.cwd()),
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

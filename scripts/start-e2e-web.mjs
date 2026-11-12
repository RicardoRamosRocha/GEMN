import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const command = process.execPath;
const expoCli = resolve('node_modules/expo/bin/cli');
const child = spawn(command, [expoCli, 'start', '--web', '--localhost', '--port', '19000'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'e2e-local-placeholder',
  },
});

const stop = (signal) => child.kill(signal);
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

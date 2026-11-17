import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const mode = process.argv[2];
if (mode !== 'check' && mode !== 'test') {
  console.error('Usage: node scripts/run-deno-tests.mjs <check|test>');
  process.exit(2);
}

const root = path.resolve('supabase/functions');
const config = path.join(root, 'deno.json');

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    else if (entry.isFile() && (mode === 'test' ? entry.name.endsWith('.test.ts') : entry.name.endsWith('.ts'))) {
      files.push(entryPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

const files = await collectFiles(root);
const denoArgs = [mode, '--config', config, ...files];
const child = spawn('deno', denoArgs, { stdio: 'inherit', shell: false });
child.on('error', (error) => {
  console.error(`Unable to start Deno: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});

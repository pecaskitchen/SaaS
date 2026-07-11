import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const apiDir = join(root, 'functions', 'api');

async function jsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await jsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

const files = await jsFiles(apiDir);
const failed = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed.push(file);
}

if (failed.length) {
  console.error(`\nFunction syntax failed in ${failed.length} file(s):`);
  for (const file of failed) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`All ${files.length} function files passed node --check`);

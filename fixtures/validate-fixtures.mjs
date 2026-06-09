#!/usr/bin/env node
/**
 * Quick JSON sanity check for all fixture files (Phase 0).
 * Usage: node fixtures/validate-fixtures.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)));

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (extname(entry.name) === '.json') {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(root);
let failed = 0;

for (const file of files) {
  const rel = file.replace(root, '').replace(/\\/g, '/');
  try {
    const raw = await readFile(file, 'utf8');
    const data = JSON.parse(raw);
    if (!data._meta?.description) {
      console.warn(`WARN ${rel}: missing _meta.description`);
    }
    console.log(`OK   ${rel}`);
  } catch (err) {
    console.error(`FAIL ${rel}:`, err.message);
    failed++;
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${files.length} fixture(s) validated.`);

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const RELEASE_DOWNLOAD_BASE = 'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download';
const DEFAULT_OUT_DIR = 'packages/web-app/public/song-master';
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function asNonEmptyString(value, key) {
  assertCondition(typeof value === 'string', `${key} must be a string`);
  const normalized = value.trim();
  assertCondition(normalized.length > 0, `${key} must not be empty`);
  return normalized;
}

function asPositiveInteger(value, key) {
  const parsed = Number(value);
  assertCondition(Number.isInteger(parsed) && parsed > 0, `${key} must be a positive integer`);
  return parsed;
}

async function fetchBytes(url, label) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${label} fetch failed: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function parseLatestPayload(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('latest.json is not valid JSON');
  }

  assertCondition(body && typeof body === 'object', 'latest.json root must be an object');
  const payload = body;
  const fileName = asNonEmptyString(payload.file_name, 'file_name');
  const schemaVersion = payload.schema_version;
  assertCondition(
    typeof schemaVersion === 'string' || typeof schemaVersion === 'number',
    'schema_version must be string or number',
  );
  const generatedAt = asNonEmptyString(payload.generated_at, 'generated_at');
  assertCondition(!Number.isNaN(Date.parse(generatedAt)), 'generated_at must be ISO8601');
  const sha256 = asNonEmptyString(payload.sha256, 'sha256').toLowerCase();
  assertCondition(SHA256_HEX_RE.test(sha256), 'sha256 must be a 64-char hex string');
  const byteSize = asPositiveInteger(payload.byte_size, 'byte_size');
  assertCondition(fileName.endsWith('.sqlite'), 'file_name must end with .sqlite');
  assertCondition(!fileName.includes('/') && !fileName.includes('\\'), 'file_name must not contain path separators');

  return {
    file_name: fileName,
    schema_version: schemaVersion,
    generated_at: generatedAt,
    sha256,
    byte_size: byteSize,
    raw: text,
  };
}

async function main() {
  const outDir = resolve(process.argv[2] ?? DEFAULT_OUT_DIR);
  const latestUrl = `${RELEASE_DOWNLOAD_BASE}/latest.json`;
  const latestBytes = await fetchBytes(latestUrl, 'latest.json');
  const latestText = new TextDecoder().decode(latestBytes);
  const latest = parseLatestPayload(latestText);

  const sqliteUrl = new URL(latest.file_name, `${RELEASE_DOWNLOAD_BASE}/`).toString();
  const sqliteBytes = await fetchBytes(sqliteUrl, latest.file_name);

  assertCondition(sqliteBytes.byteLength === latest.byte_size, 'byte_size mismatch');
  const digest = createHash('sha256').update(sqliteBytes).digest('hex');
  assertCondition(digest === latest.sha256, 'sha256 mismatch');

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'latest.json'), latest.raw, { encoding: 'utf8' });
  await writeFile(join(outDir, latest.file_name), sqliteBytes);

  console.log(`[song-master-sync] latest.json -> ${join(outDir, 'latest.json')}`);
  console.log(`[song-master-sync] sqlite -> ${join(outDir, latest.file_name)}`);
}

await main();

#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';

function parseArgs() {
  const args = process.argv.slice(2);
  const map = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (key?.startsWith('--') && value) {
      map.set(key.slice(2), value);
      i += 1;
    }
  }
  return {
    port: Number(map.get('port') ?? '8787'),
    sqlitePath: resolve(map.get('sqlite') ?? './song_master.sqlite'),
    schemaVersion: Number(map.get('schema') ?? '1'),
    updatedAt: map.get('updated-at') ?? new Date().toISOString(),
  };
}

const args = parseArgs();
const sqliteBytes = readFileSync(args.sqlitePath);
const sqliteFileName = basename(args.sqlitePath);
const sha256 = createHash('sha256').update(sqliteBytes).digest('hex');

const latestJson = JSON.stringify(
  {
    file_name: sqliteFileName,
    schema_version: args.schemaVersion,
    sha256,
    byte_size: sqliteBytes.byteLength,
    updated_at: args.updatedAt,
    download_url: `http://localhost:${args.port}/song-master/${sqliteFileName}`,
  },
  null,
  2,
);

const server = createServer((req, res) => {
  if (!req.url) {
    res.statusCode = 404;
    res.end();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/song-master/latest.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(latestJson);
    return;
  }

  if (req.url === `/song-master/${sqliteFileName}`) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.end(sqliteBytes);
    return;
  }

  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(args.port, () => {
  console.log(`[mock-song-master] http://localhost:${args.port}`);
  console.log(`[mock-song-master] latest: /song-master/latest.json`);
  console.log(`[mock-song-master] sqlite: /song-master/${sqliteFileName}`);
});

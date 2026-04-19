#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { buildDeletePublicTournamentSql } from './delete-public-tournament-lib.mjs';

function parseArgs(argv) {
  const parsed = {
    database: '',
    publicId: '',
    reason: 'manual moderation delete',
    operator: 'manual',
    local: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--database':
        parsed.database = argv[index + 1] ?? '';
        index += 1;
        break;
      case '--public-id':
        parsed.publicId = argv[index + 1] ?? '';
        index += 1;
        break;
      case '--reason':
        parsed.reason = argv[index + 1] ?? parsed.reason;
        index += 1;
        break;
      case '--operator':
        parsed.operator = argv[index + 1] ?? parsed.operator;
        index += 1;
        break;
      case '--local':
        parsed.local = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!parsed.database || !parsed.publicId) {
    throw new Error(
      'usage: node scripts/delete-public-tournament.mjs --database <name> --public-id <id> [--reason <text>] [--operator <name>] [--local]',
    );
  }

  return parsed;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const deletedAt = new Date().toISOString();
  const sql = buildDeletePublicTournamentSql({
    publicId: args.publicId,
    deletedAt,
    reason: args.reason,
    requestFingerprint: `ops:${args.operator}`,
  });

  const commandArgs = [
    'exec',
    'wrangler',
    'd1',
    'execute',
    args.database,
    args.local ? '--local' : '--remote',
    '--command',
    sql,
  ];

  const result = spawnSync('pnpm', commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}

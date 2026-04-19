import { describe, expect, it } from 'vitest';
import { buildDeletePublicTournamentSql } from '../scripts/delete-public-tournament-lib.mjs';

describe('delete public tournament sql builder', () => {
  it('builds a soft-delete statement with audit insert', () => {
    const sql = buildDeletePublicTournamentSql({
      publicId: "public-'id",
      deletedAt: '2026-04-19T12:00:00.000Z',
      reason: "moderator's note",
      requestFingerprint: 'ops:tester',
    });

    expect(sql).toContain('UPDATE public_tournaments SET deleted_at');
    expect(sql).toContain('INSERT INTO public_tournament_audit_logs');
    expect(sql).toContain("'public-''id'");
    expect(sql).toContain(`'{"reason":"moderator''s note"}'`);
  });
});

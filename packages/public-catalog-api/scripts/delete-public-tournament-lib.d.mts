export interface DeletePublicTournamentSqlOptions {
  publicId: string;
  deletedAt: string;
  reason?: string;
  requestFingerprint?: string;
}

export function buildDeletePublicTournamentSql(
  options: DeletePublicTournamentSqlOptions,
): string;

function assertNonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
}

function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildDeletePublicTournamentSql({
  publicId,
  deletedAt,
  reason = 'manual moderation delete',
  requestFingerprint = 'ops:manual',
}) {
  assertNonEmpty(publicId, 'publicId');
  assertNonEmpty(deletedAt, 'deletedAt');
  assertNonEmpty(reason, 'reason');
  assertNonEmpty(requestFingerprint, 'requestFingerprint');

  const detailJson = JSON.stringify({ reason });

  return [
    'BEGIN;',
    `UPDATE public_tournaments SET deleted_at = ${sqlString(deletedAt)}, updated_at = ${sqlString(deletedAt)}, delete_reason = ${sqlString(reason)} WHERE public_id = ${sqlString(publicId)} AND deleted_at IS NULL;`,
    `INSERT INTO public_tournament_audit_logs (public_id, registry_hash, result, request_fingerprint, origin, detail_json, created_at) SELECT public_id, registry_hash, 'deleted', ${sqlString(requestFingerprint)}, 'ops', ${sqlString(detailJson)}, ${sqlString(deletedAt)} FROM public_tournaments WHERE public_id = ${sqlString(publicId)} AND deleted_at = ${sqlString(deletedAt)};`,
    'COMMIT;',
  ].join(' ');
}

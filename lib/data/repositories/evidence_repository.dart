import 'package:sqflite/sqflite.dart';

import '../db/app_database.dart';
import '../models/evidence.dart';

class EvidenceRepository {
  EvidenceRepository(this._db);

  final AppDatabase _db;

  Future<Evidence?> fetchEvidence(String uuid, int chartId) async {
    final db = await _db.database;
    final rows = await db.query(
      'evidences',
      where: 'tournament_uuid = ? AND chart_id = ?',
      whereArgs: [uuid, chartId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    return Evidence.fromMap(rows.first);
  }

  Future<List<Evidence>> fetchEvidencesByTournament(String uuid) async {
    final db = await _db.database;
    final rows = await db.query(
      'evidences',
      where: 'tournament_uuid = ?',
      whereArgs: [uuid],
    );
    return rows.map(Evidence.fromMap).toList();
  }

  Future<int> countSubmittedByTournament(String uuid) async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      'SELECT COUNT(*) as cnt FROM evidences WHERE tournament_uuid = ?',
      [uuid],
    );
    return Sqflite.firstIntValue(rows) ?? 0;
  }

  Future<Map<String, int>> countSubmittedByTournamentAll() async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      'SELECT tournament_uuid, COUNT(*) as cnt '
      'FROM evidences '
      'GROUP BY tournament_uuid',
    );
    final result = <String, int>{};
    for (final row in rows) {
      final uuid = row['tournament_uuid'] as String?;
      if (uuid == null) continue;
      result[uuid] = (row['cnt'] as int?) ?? 0;
    }
    return result;
  }

  Future<void> upsertEvidence(Evidence evidence) async {
    final db = await _db.database;
    await db.insert(
      'evidences',
      evidence.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> deleteEvidence(String uuid, int chartId) async {
    final db = await _db.database;
    await db.delete(
      'evidences',
      where: 'tournament_uuid = ? AND chart_id = ?',
      whereArgs: [uuid, chartId],
    );
  }

  Future<void> markUpdatePosted({
    required int evidenceId,
    required String postedAt,
  }) async {
    final db = await _db.database;
    await db.update(
      'evidences',
      {
        'posted_flag_update': 1,
        'last_posted_at': postedAt,
      },
      where: 'evidence_id = ?',
      whereArgs: [evidenceId],
    );
  }
}

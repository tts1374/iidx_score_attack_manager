import 'package:sqflite/sqflite.dart';

import '../db/app_database.dart';
import '../models/tournament.dart';
import '../models/tournament_chart.dart';

class TournamentRepository {
  TournamentRepository(this._db);

  final AppDatabase _db;

  Future<void> createTournament(
    Tournament tournament,
    List<TournamentChart> charts,
  ) async {
    final db = await _db.database;
    await db.transaction((txn) async {
      await txn.insert('tournaments', tournament.toMap());
      for (final chart in charts) {
        await txn.insert('tournament_charts', chart.toMap());
      }
    });
  }

  Future<List<Tournament>> fetchAll() async {
    final db = await _db.database;
    final rows = await db.query(
      'tournaments',
      orderBy: 'start_date DESC, created_at DESC',
    );
    return rows.map(Tournament.fromMap).toList();
  }

  Future<Tournament?> fetchByUuid(String uuid) async {
    final db = await _db.database;
    final rows = await db.query(
      'tournaments',
      where: 'tournament_uuid = ?',
      whereArgs: [uuid],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    return Tournament.fromMap(rows.first);
  }

  Future<bool> exists(String uuid) async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      'SELECT 1 FROM tournaments WHERE tournament_uuid = ? LIMIT 1',
      [uuid],
    );
    return rows.isNotEmpty;
  }

  Future<List<TournamentChart>> fetchCharts(String uuid) async {
    final db = await _db.database;
    final rows = await db.query(
      'tournament_charts',
      where: 'tournament_uuid = ?',
      whereArgs: [uuid],
      orderBy: 'sort_order ASC',
    );
    return rows.map(TournamentChart.fromMap).toList();
  }

  Future<int> countCharts(String uuid) async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      'SELECT COUNT(*) as cnt FROM tournament_charts WHERE tournament_uuid = ?',
      [uuid],
    );
    return Sqflite.firstIntValue(rows) ?? 0;
  }

  Future<Map<String, int>> countChartsByTournament() async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      'SELECT tournament_uuid, COUNT(*) as cnt '
      'FROM tournament_charts '
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

  Future<void> deleteTournament(String uuid) async {
    final db = await _db.database;
    await db.transaction((txn) async {
      await txn.delete('evidences', where: 'tournament_uuid = ?', whereArgs: [uuid]);
      await txn.delete('tournament_charts',
          where: 'tournament_uuid = ?', whereArgs: [uuid]);
      await txn.delete('tournaments', where: 'tournament_uuid = ?', whereArgs: [uuid]);
    });
  }

  Future<void> updateBackgroundImage(
    String uuid,
    String? backgroundImagePath,
    String updatedAt,
  ) async {
    final db = await _db.database;
    await db.update(
      'tournaments',
      {
        'background_image_path': backgroundImagePath,
        'updated_at': updatedAt,
      },
      where: 'tournament_uuid = ?',
      whereArgs: [uuid],
    );
  }
}

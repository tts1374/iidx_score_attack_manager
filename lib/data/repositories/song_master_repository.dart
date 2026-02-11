import 'package:sqflite/sqflite.dart';

import '../db/song_master_database.dart';
import '../models/song_master.dart';

class SongMasterRepository {
  SongMasterRepository(this._db);

  final SongMasterDatabase _db;

  Future<List<SongMasterMusic>> searchMusic(String keyword) async {
    final db = await _db.database;
    if (db == null) {
      return [];
    }
    final rows = await db.query(
      'music',
      where: '(is_ac_active = 1 OR is_inf_active = 1) AND title LIKE ?',
      whereArgs: ['%$keyword%'],
      orderBy: 'title ASC',
      limit: 50,
    );
    return rows.map(SongMasterMusic.fromMap).toList();
  }

  Future<List<SongMasterMusic>> fetchActiveMusic() async {
    final db = await _db.database;
    if (db == null) {
      return [];
    }
    final rows = await db.query(
      'music',
      where: 'is_ac_active = 1 OR is_inf_active = 1',
      orderBy: 'title ASC',
    );
    return rows.map(SongMasterMusic.fromMap).toList();
  }

  Future<List<SongMasterChart>> fetchChartsByMusic(int musicId) async {
    final db = await _db.database;
    if (db == null) {
      return [];
    }
    final rows = await db.query(
      'chart',
      where: 'music_id = ? AND is_active = 1',
      whereArgs: [musicId],
      orderBy: 'play_style ASC, difficulty ASC',
    );
    return rows.map(SongMasterChart.fromMap).toList();
  }

  Future<SongMasterChart?> fetchChartById(int chartId) async {
    final db = await _db.database;
    if (db == null) {
      return null;
    }
    final rows = await db.query(
      'chart',
      where: 'chart_id = ?',
      whereArgs: [chartId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    return SongMasterChart.fromMap(rows.first);
  }

  Future<SongMasterMusic?> fetchMusicById(int musicId) async {
    final db = await _db.database;
    if (db == null) {
      return null;
    }
    final rows = await db.query(
      'music',
      where: 'music_id = ?',
      whereArgs: [musicId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    return SongMasterMusic.fromMap(rows.first);
  }

  Future<String?> fetchMetaValue(String key) async {
    final db = await _db.database;
    if (db == null) {
      return null;
    }
    final rows = await db.query('meta', limit: 1);
    if (rows.isEmpty) {
      return null;
    }
    return rows.first[key] as String?;
  }
}

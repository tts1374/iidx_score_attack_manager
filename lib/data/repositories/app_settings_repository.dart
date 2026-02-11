import 'package:sqflite/sqflite.dart';

import '../db/app_database.dart';
import '../models/app_setting.dart';

class AppSettingsRepository {
  AppSettingsRepository(this._db);

  final AppDatabase _db;

  Future<String?> getValue(String key) async {
    final db = await _db.database;
    final rows =
        await db.query('app_settings', where: 'key = ?', whereArgs: [key]);
    if (rows.isEmpty) {
      return null;
    }
    return AppSetting.fromMap(rows.first).value;
  }

  Future<void> setValue(String key, String value) async {
    final db = await _db.database;
    await db.insert(
      'app_settings',
      AppSetting(key: key, value: value).toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}

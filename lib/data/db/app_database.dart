import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart' as sqflite;

import '../../core/constants.dart';

/// DBファイルパスを解決する関数。
typedef AppDatabasePathResolver = Future<String> Function();

/// DB接続をオープンする関数。
typedef AppDatabaseOpener = Future<sqflite.Database> Function(
  String path, {
  int? version,
  sqflite.OnDatabaseCreateFn? onCreate,
});

/// アプリ用SQLite（`app_data.sqlite`）の管理クラス。
class AppDatabase {
  AppDatabase({
    required AppDatabasePathResolver resolvePath,
    required AppDatabaseOpener openDatabase,
  })  : _resolvePath = resolvePath,
        _openDatabase = openDatabase;

  AppDatabase._default()
      : _resolvePath = _defaultPathResolver,
        _openDatabase = _defaultOpenDatabase;

  static final AppDatabase instance = AppDatabase._default();

  final AppDatabasePathResolver _resolvePath;
  final AppDatabaseOpener _openDatabase;
  sqflite.Database? _db;

  /// DB接続を返す。未接続時は初回オープンする。
  Future<sqflite.Database> get database async {
    if (_db != null) {
      return _db!;
    }
    _db = await _open();
    return _db!;
  }

  /// 接続を閉じる。
  Future<void> close() async {
    if (_db != null) {
      await _db!.close();
      _db = null;
    }
  }

  /// DBファイルを削除し初期状態へ戻す。
  Future<void> reset() async {
    final path = await _resolvePath();
    await close();
    final file = File(path);
    if (await file.exists()) {
      await file.delete();
    }
  }

  Future<sqflite.Database> _open() async {
    final path = await _resolvePath();
    return _openDatabase(
      path,
      version: 1,
      onCreate: _onCreate,
    );
  }

  static Future<String> _defaultPathResolver() async {
    final dir = await getApplicationSupportDirectory();
    return p.join(dir.path, appDatabaseFileName);
  }

  static Future<sqflite.Database> _defaultOpenDatabase(
    String path, {
    int? version,
    sqflite.OnDatabaseCreateFn? onCreate,
  }) {
    return sqflite.openDatabase(
      path,
      version: version,
      onCreate: onCreate,
    );
  }

  static Future<void> _onCreate(sqflite.Database db, int _) async {
    await db.execute('''
CREATE TABLE tournaments (
  tournament_uuid TEXT PRIMARY KEY,
  tournament_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  hashtag TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_imported INTEGER NOT NULL DEFAULT 0,
  background_image_path TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
''');
    await db.execute('''
CREATE TABLE tournament_charts (
  tournament_chart_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_uuid TEXT NOT NULL,
  chart_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tournament_uuid, chart_id),
  UNIQUE(tournament_uuid, sort_order),
  FOREIGN KEY(tournament_uuid) REFERENCES tournaments(tournament_uuid)
)
''');
    await db.execute('''
CREATE TABLE evidences (
  evidence_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_uuid TEXT NOT NULL,
  chart_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  update_seq INTEGER NOT NULL,
  last_updated_at TEXT NOT NULL,
  posted_flag_create INTEGER NOT NULL,
  posted_flag_update INTEGER NOT NULL,
  last_posted_at TEXT NULL,
  UNIQUE(tournament_uuid, chart_id),
  FOREIGN KEY(tournament_uuid) REFERENCES tournaments(tournament_uuid)
)
''');
    await db.execute('''
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
''');
  }
}

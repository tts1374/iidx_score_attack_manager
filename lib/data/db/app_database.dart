import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../../core/constants.dart';

class AppDatabase {
  AppDatabase._();

  static final AppDatabase instance = AppDatabase._();
  Database? _db;

  Future<Database> get database async {
    if (_db != null) {
      return _db!;
    }
    _db = await _open();
    return _db!;
  }

  Future<Database> _open() async {
    final dir = await getApplicationSupportDirectory();
    final path = p.join(dir.path, appDatabaseFileName);
    return openDatabase(
      path,
      version: 1,
      onCreate: (db, _) async {
        await db.execute('''
CREATE TABLE tournaments (
  tournament_uuid TEXT PRIMARY KEY,
  tournament_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  hashtag TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
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
      },
    );
  }
}

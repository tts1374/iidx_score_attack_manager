import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../../core/constants.dart';

class SongMasterDatabase {
  SongMasterDatabase._();

  static final SongMasterDatabase instance = SongMasterDatabase._();
  Database? _db;

  Future<Database?> get database async {
    if (_db != null) {
      return _db!;
    }
    _db = await _open();
    return _db;
  }

  Future<Database?> _open() async {
    final dir = await getApplicationSupportDirectory();
    final path = p.join(dir.path, songMasterFileName);
    if (!File(path).existsSync()) {
      return null;
    }
    return openDatabase(path, readOnly: true);
  }

  Future<String?> existingPath() async {
    final dir = await getApplicationSupportDirectory();
    final path = p.join(dir.path, songMasterFileName);
    if (!File(path).existsSync()) {
      return null;
    }
    return path;
  }

  Future<void> reset() async {
    final dir = await getApplicationSupportDirectory();
    final path = p.join(dir.path, songMasterFileName);
    if (File(path).existsSync()) {
      await File(path).delete();
    }
    _db = null;
  }

  Future<void> close() async {
    if (_db != null) {
      await _db!.close();
      _db = null;
    }
  }
}

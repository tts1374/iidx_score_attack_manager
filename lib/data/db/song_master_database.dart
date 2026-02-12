import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../../core/constants.dart';

/// 曲マスタDB（`song_master.sqlite`）への読み取り専用接続を提供する。
class SongMasterDatabase {
  SongMasterDatabase._();

  static final SongMasterDatabase instance = SongMasterDatabase._();
  Database? _db;

  /// DB接続を返す。ファイル未配置の場合は `null` を返す。
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

  /// `song_master.sqlite` の存在パスを返す。未配置時は `null`。
  Future<String?> existingPath() async {
    final dir = await getApplicationSupportDirectory();
    final path = p.join(dir.path, songMasterFileName);
    if (!File(path).existsSync()) {
      return null;
    }
    return path;
  }

  /// 曲マスタDBを削除して接続をリセットする。
  Future<void> reset() async {
    final dir = await getApplicationSupportDirectory();
    final path = p.join(dir.path, songMasterFileName);
    if (File(path).existsSync()) {
      await File(path).delete();
    }
    _db = null;
  }

  /// 開いている接続を明示的にクローズする。
  Future<void> close() async {
    if (_db != null) {
      await _db!.close();
      _db = null;
    }
  }
}

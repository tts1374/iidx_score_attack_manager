import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../core/date_utils.dart';

/// JSTの現在時刻を返す関数のProvider。
final nowJstProvider = Provider<DateTime Function()>((ref) {
  return nowJst;
});

/// UUID v4 を生成する関数のProvider。
final uuidV4Provider = Provider<String Function()>((ref) {
  const uuid = Uuid();
  return uuid.v4;
});

/// Application Support Directory を返す関数のProvider。
final appSupportDirectoryProvider = Provider<Future<Directory> Function()>((ref) {
  return getApplicationSupportDirectory;
});

/// ファイルI/Oの抽象ポート。
abstract class FileSystemPort {
  Future<void> writeAsBytes(
    String path,
    List<int> bytes, {
    bool flush = false,
  });

  Future<bool> exists(String path);

  Future<void> delete(String path);
}

/// `dart:io` を使った標準ファイルシステム実装。
class IoFileSystemPort implements FileSystemPort {
  const IoFileSystemPort();

  @override
  Future<void> writeAsBytes(
    String path,
    List<int> bytes, {
    bool flush = false,
  }) {
    return File(path).writeAsBytes(bytes, flush: flush);
  }

  @override
  Future<bool> exists(String path) {
    return File(path).exists();
  }

  @override
  Future<void> delete(String path) {
    return File(path).delete();
  }
}

/// ファイルシステムポートProvider。
final fileSystemProvider = Provider<FileSystemPort>((ref) {
  return const IoFileSystemPort();
});


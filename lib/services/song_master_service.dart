import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../core/constants.dart';
import '../data/db/song_master_database.dart';
import '../domain/repositories/app_settings_repository.dart';
import '../data/repositories/song_master_repository.dart';
import '../core/date_utils.dart';

enum SongMasterUpdateStatus {
  upToDate,
  updated,
  failedInitial,
  failedCached,
  missingAsset,
  invalidSchema,
  unconfigured,
}

class SongMasterUpdateResult {
  const SongMasterUpdateResult(this.status, {this.message});
  final SongMasterUpdateStatus status;
  final String? message;
}

class SongMasterService {
  SongMasterService(
    this._settingsRepo,
    this._songMasterDb,
  );

  final AppSettingsRepositoryContract _settingsRepo;
  final SongMasterDatabase _songMasterDb;

  Future<SongMasterUpdateResult> checkAndUpdateIfNeeded() async {
    if (githubRepoOwner == 'YOUR_GITHUB_OWNER' ||
        githubRepoName == 'YOUR_GITHUB_REPO') {
      return const SongMasterUpdateResult(
        SongMasterUpdateStatus.unconfigured,
        message: 'GitHubリポジトリ設定が未入力です。',
      );
    }

    final latest = await _fetchLatestRelease();
    if (latest == null) {
      final hasLocal = await _songMasterDb.existingPath() != null;
      return SongMasterUpdateResult(
        hasLocal ? SongMasterUpdateStatus.failedCached : SongMasterUpdateStatus.failedInitial,
        message: 'GitHubから最新情報を取得できませんでした。',
      );
    }

    final asset = _pickAsset(latest);
    if (asset == null) {
      return const SongMasterUpdateResult(
        SongMasterUpdateStatus.missingAsset,
        message: 'song_master.sqlite が見つかりません。',
      );
    }

    final assetUpdatedAt = asset['updated_at'] as String?;
    if (assetUpdatedAt == null) {
      return const SongMasterUpdateResult(
        SongMasterUpdateStatus.missingAsset,
        message: '更新日時が取得できませんでした。',
      );
    }

    final cachedUpdatedAt =
        await _settingsRepo.getValue(settingSongMasterAssetUpdatedAt);
    if (cachedUpdatedAt == assetUpdatedAt) {
      final repo = SongMasterRepository(_songMasterDb);
      final schemaVersion = await repo.fetchMetaValue('schema_version');
      if (schemaVersion == null || schemaVersion != songMasterSchemaVersion) {
        return const SongMasterUpdateResult(
          SongMasterUpdateStatus.invalidSchema,
          message: '曲マスタのスキーマが一致しません。',
        );
      }
      final metaUpdatedAt = await repo.fetchMetaValue('asset_updated_at');
      if (metaUpdatedAt != null &&
          cachedUpdatedAt != null &&
          metaUpdatedAt.compareTo(cachedUpdatedAt) > 0) {
        await _settingsRepo.setValue(
          settingSongMasterAssetUpdatedAt,
          metaUpdatedAt,
        );
        await _settingsRepo.setValue(
          settingSongMasterDownloadedAt,
          nowJst().toIso8601String(),
        );
        await _settingsRepo.setValue(
          settingSongMasterSchemaVersion,
          schemaVersion,
        );
        await _settingsRepo.setValue(
          settingSongMasterUpdateSource,
          songMasterSourceGithubMetadata,
        );
        return const SongMasterUpdateResult(SongMasterUpdateStatus.updated);
      }
      await _settingsRepo.setValue(
        settingSongMasterUpdateSource,
        songMasterSourceLocalCache,
      );
      return const SongMasterUpdateResult(SongMasterUpdateStatus.upToDate);
    }

    final downloadUrl = asset['browser_download_url'] as String?;
    if (downloadUrl == null) {
      return const SongMasterUpdateResult(
        SongMasterUpdateStatus.missingAsset,
        message: 'ダウンロードURLが見つかりません。',
      );
    }

    final downloaded = await _downloadAsset(downloadUrl);
    if (!downloaded) {
      final hasLocal = await _songMasterDb.existingPath() != null;
      return SongMasterUpdateResult(
        hasLocal ? SongMasterUpdateStatus.failedCached : SongMasterUpdateStatus.failedInitial,
        message: 'ダウンロードに失敗しました。',
      );
    }

    await _songMasterDb.close();

    final repo = SongMasterRepository(_songMasterDb);
    final schemaVersion = await repo.fetchMetaValue('schema_version');
    if (schemaVersion == null || schemaVersion != songMasterSchemaVersion) {
      await _songMasterDb.reset();
      return const SongMasterUpdateResult(
        SongMasterUpdateStatus.invalidSchema,
        message: '曲マスタのスキーマが一致しません。',
      );
    }

    await _settingsRepo.setValue(settingSongMasterAssetUpdatedAt, assetUpdatedAt);
    await _settingsRepo.setValue(settingSongMasterDownloadedAt, nowJst().toIso8601String());
    await _settingsRepo.setValue(settingSongMasterSchemaVersion, schemaVersion);
    await _settingsRepo.setValue(
      settingSongMasterUpdateSource,
      songMasterSourceGithubDownload,
    );

    return const SongMasterUpdateResult(SongMasterUpdateStatus.updated);
  }

  Future<Map<String, dynamic>?> _fetchLatestRelease() async {
    final url =
        Uri.parse('https://api.github.com/repos/$githubRepoOwner/$githubRepoName/releases/latest');
    try {
      final response = await http.get(url);
      if (response.statusCode != 200) {
        return null;
      }
      return jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic>? _pickAsset(Map<String, dynamic> release) {
    final assets = release['assets'];
    if (assets is! List) {
      return null;
    }
    for (final asset in assets) {
      if (asset is Map<String, dynamic> &&
          asset['name'] == githubAssetFileName) {
        return asset;
      }
    }
    return null;
  }

  Future<bool> _downloadAsset(String url) async {
    final dir = await getApplicationSupportDirectory();
    final targetPath = p.join(dir.path, songMasterFileName);
    final tempPath = p.join(dir.path, '${songMasterFileName}.tmp');
    try {
      final response = await http.get(Uri.parse(url));
      if (response.statusCode != 200) {
        return false;
      }
      final tempFile = File(tempPath);
      await tempFile.writeAsBytes(response.bodyBytes, flush: true);
      final target = File(targetPath);
      if (target.existsSync()) {
        await target.delete();
      }
      await tempFile.rename(targetPath);
      return true;
    } catch (_) {
      return false;
    }
  }
}

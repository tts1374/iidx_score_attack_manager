import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;

import '../data/models/evidence.dart';
import '../domain/repositories/evidence_repository.dart';
import '../providers/system_providers.dart';

/// 画像バイト配列からSHA-256ハッシュ（16進文字列）を返す。
String computeSha256Hex(List<int> bytes) {
  return sha256.convert(bytes).toString();
}

/// エビデンス保存ファイル名を規約に従って生成する。
String buildEvidenceFileName({
  required String tournamentUuid,
  required int chartId,
  required String originalFileName,
}) {
  final ext = p.extension(originalFileName).replaceFirst('.', '');
  return '${tournamentUuid}_$chartId.${ext.isEmpty ? 'jpg' : ext}';
}

/// エビデンス画像の保存・更新・削除を扱うサービス。
class EvidenceService {
  EvidenceService(
    this._repo, {
    required DateTime Function() nowJst,
    required Future<Directory> Function() appSupportDirectory,
    required FileSystemPort fileSystem,
  })  : _nowJst = nowJst,
        _appSupportDirectory = appSupportDirectory,
        _fileSystem = fileSystem;

  final EvidenceRepositoryContract _repo;
  final DateTime Function() _nowJst;
  final Future<Directory> Function() _appSupportDirectory;
  final FileSystemPort _fileSystem;

  /// 画像選択（カメラ/ギャラリー）からエビデンス登録まで実行する。
  Future<EvidenceSaveResult> registerEvidence({
    required String tournamentUuid,
    required int chartId,
    required ImageSource source,
  }) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source);
    if (picked == null) {
      return const EvidenceSaveResult.cancelled();
    }
    return registerEvidenceFile(
      tournamentUuid: tournamentUuid,
      chartId: chartId,
      picked: picked,
    );
  }

  /// 選択済み画像ファイルをエビデンスとして登録する。
  ///
  /// 同一ハッシュの場合は更新なしを返す。
  Future<EvidenceSaveResult> registerEvidenceFile({
    required String tournamentUuid,
    required int chartId,
    required XFile picked,
  }) async {
    final bytes = await picked.readAsBytes();
    final digest = computeSha256Hex(bytes);

    final existing = await _repo.fetchEvidence(tournamentUuid, chartId);
    if (existing != null && existing.sha256 == digest) {
      return const EvidenceSaveResult.noChange();
    }

    final decoded = img.decodeImage(bytes);
    if (decoded == null) {
      return const EvidenceSaveResult.failed('画像の解析に失敗しました。');
    }

    final dir = await _appSupportDirectory();
    final filename = buildEvidenceFileName(
      tournamentUuid: tournamentUuid,
      chartId: chartId,
      originalFileName: picked.name,
    );
    final path = p.join(dir.path, filename);
    await _fileSystem.writeAsBytes(path, bytes, flush: true);

    final mime = lookupMimeType(path, headerBytes: bytes) ?? 'image/jpeg';

    final evidence = Evidence(
      evidenceId: existing?.evidenceId,
      tournamentUuid: tournamentUuid,
      chartId: chartId,
      filePath: path,
      originalFilename: picked.name,
      mimeType: mime,
      fileSize: bytes.length,
      width: decoded.width,
      height: decoded.height,
      sha256: digest,
      updateSeq: (existing?.updateSeq ?? 0) + 1,
      lastUpdatedAt: _nowJst().toIso8601String(),
      postedFlagCreate: existing?.postedFlagCreate ?? 0,
      // A newly saved image is always pending for update-post.
      postedFlagUpdate: 0,
      lastPostedAt: existing?.lastPostedAt,
    );
    await _repo.upsertEvidence(evidence);

    return EvidenceSaveResult.saved(evidence);
  }

  /// 画像ファイルとDBレコードを削除する。
  Future<void> deleteEvidence(Evidence evidence) async {
    if (await _fileSystem.exists(evidence.filePath)) {
      await _fileSystem.delete(evidence.filePath);
    }
    await _repo.deleteEvidence(evidence.tournamentUuid, evidence.chartId);
  }
}

/// エビデンス保存処理の戻り値。
class EvidenceSaveResult {
  const EvidenceSaveResult._(this.status, {this.evidence, this.message});

  final EvidenceSaveStatus status;
  final Evidence? evidence;
  final String? message;

  const EvidenceSaveResult.cancelled()
      : this._(EvidenceSaveStatus.cancelled);

  const EvidenceSaveResult.noChange() : this._(EvidenceSaveStatus.noChange);

  const EvidenceSaveResult.failed(String message)
      : this._(EvidenceSaveStatus.failed, message: message);

  EvidenceSaveResult.saved(Evidence evidence)
      : this._(EvidenceSaveStatus.saved, evidence: evidence);
}

/// エビデンス保存処理の状態。
enum EvidenceSaveStatus { saved, cancelled, noChange, failed }

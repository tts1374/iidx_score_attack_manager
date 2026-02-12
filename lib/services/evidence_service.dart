import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../core/date_utils.dart';
import '../data/models/evidence.dart';
import '../domain/repositories/evidence_repository.dart';

class EvidenceService {
  EvidenceService(this._repo);

  final EvidenceRepositoryContract _repo;

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

  Future<EvidenceSaveResult> registerEvidenceFile({
    required String tournamentUuid,
    required int chartId,
    required XFile picked,
  }) async {
    final bytes = await picked.readAsBytes();
    final digest = sha256.convert(bytes).toString();

    final existing = await _repo.fetchEvidence(tournamentUuid, chartId);
    if (existing != null && existing.sha256 == digest) {
      return const EvidenceSaveResult.noChange();
    }

    final decoded = img.decodeImage(bytes);
    if (decoded == null) {
      return const EvidenceSaveResult.failed('画像の解析に失敗しました。');
    }

    final dir = await getApplicationSupportDirectory();
    final ext = p.extension(picked.name).replaceFirst('.', '');
    final filename = '${tournamentUuid}_$chartId.${ext.isEmpty ? 'jpg' : ext}';
    final path = p.join(dir.path, filename);
    final file = File(path);
    await file.writeAsBytes(bytes, flush: true);

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
      lastUpdatedAt: nowJst().toIso8601String(),
      postedFlagCreate: existing?.postedFlagCreate ?? 0,
      // A newly saved image is always pending for update-post.
      postedFlagUpdate: 0,
      lastPostedAt: existing?.lastPostedAt,
    );
    await _repo.upsertEvidence(evidence);

    return EvidenceSaveResult.saved(evidence);
  }

  Future<void> deleteEvidence(Evidence evidence) async {
    final file = File(evidence.filePath);
    if (file.existsSync()) {
      await file.delete();
    }
    await _repo.deleteEvidence(evidence.tournamentUuid, evidence.chartId);
  }
}

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

enum EvidenceSaveStatus { saved, cancelled, noChange, failed }

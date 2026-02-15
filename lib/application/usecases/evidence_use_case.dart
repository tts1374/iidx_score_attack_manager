import 'package:image_picker/image_picker.dart';

import '../../data/models/evidence.dart';
import '../../domain/repositories/evidence_repository.dart';
import '../../services/evidence_service.dart';

/// エビデンス参照・保存・投稿状態更新のユースケース。
class EvidenceUseCase {
  EvidenceUseCase(
    this._repository,
    this._service,
  );

  final EvidenceRepositoryContract _repository;
  final EvidenceService _service;

  /// 単一譜面のエビデンスを取得する。
  Future<Evidence?> fetchEvidence(String uuid, int chartId) {
    return _repository.fetchEvidence(uuid, chartId);
  }

  /// 大会単位でエビデンス一覧を取得する。
  Future<List<Evidence>> fetchEvidencesByTournament(String uuid) {
    return _repository.fetchEvidencesByTournament(uuid);
  }

  /// 大会ごとの提出済み件数を取得する。
  Future<Map<String, int>> countSubmittedByTournamentAll() {
    return _repository.countSubmittedByTournamentAll();
  }

  /// 画像取得元（カメラ/ギャラリー）を指定して保存する。
  Future<EvidenceSaveResult> registerEvidence({
    required String tournamentUuid,
    required int chartId,
    required ImageSource source,
  }) {
    return _service.registerEvidence(
      tournamentUuid: tournamentUuid,
      chartId: chartId,
      source: source,
    );
  }

  /// 既に選択済みの画像ファイルを保存する。
  Future<EvidenceSaveResult> registerEvidenceFile({
    required String tournamentUuid,
    required int chartId,
    required XFile picked,
  }) {
    return _service.registerEvidenceFile(
      tournamentUuid: tournamentUuid,
      chartId: chartId,
      picked: picked,
    );
  }

  /// エビデンス本体（DB + 画像ファイル）を削除する。
  Future<void> deleteEvidence(Evidence evidence) {
    return _service.deleteEvidence(evidence);
  }

  /// 投稿完了後に更新投稿フラグを更新する。
  Future<void> markUpdatePosted({
    required int evidenceId,
    required String postedAt,
  }) {
    return _repository.markUpdatePosted(
      evidenceId: evidenceId,
      postedAt: postedAt,
    );
  }
}

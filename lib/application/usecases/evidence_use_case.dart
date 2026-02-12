import 'package:image_picker/image_picker.dart';

import '../../data/models/evidence.dart';
import '../../domain/repositories/evidence_repository.dart';
import '../../services/evidence_service.dart';

class EvidenceUseCase {
  EvidenceUseCase(
    this._repository,
    this._service,
  );

  final EvidenceRepositoryContract _repository;
  final EvidenceService _service;

  Future<Evidence?> fetchEvidence(String uuid, int chartId) {
    return _repository.fetchEvidence(uuid, chartId);
  }

  Future<List<Evidence>> fetchEvidencesByTournament(String uuid) {
    return _repository.fetchEvidencesByTournament(uuid);
  }

  Future<Map<String, int>> countSubmittedByTournamentAll() {
    return _repository.countSubmittedByTournamentAll();
  }

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

  Future<void> deleteEvidence(Evidence evidence) {
    return _service.deleteEvidence(evidence);
  }

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

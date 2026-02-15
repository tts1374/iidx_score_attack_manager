import '../../data/models/evidence.dart';

abstract class EvidenceRepositoryContract {
  Future<Evidence?> fetchEvidence(String uuid, int chartId);
  Future<List<Evidence>> fetchEvidencesByTournament(String uuid);
  Future<int> countSubmittedByTournament(String uuid);
  Future<Map<String, int>> countSubmittedByTournamentAll();
  Future<void> upsertEvidence(Evidence evidence);
  Future<void> deleteEvidence(String uuid, int chartId);
  Future<void> markUpdatePosted({
    required int evidenceId,
    required String postedAt,
  });
}

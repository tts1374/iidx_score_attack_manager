import '../../domain/repositories/tournament_repository.dart';
import '../../data/models/tournament.dart';
import '../../data/models/tournament_chart.dart';

class TournamentUseCase {
  TournamentUseCase(
    this._repository, {
    required void Function() onChanged,
  }) : _onChanged = onChanged;

  final TournamentRepositoryContract _repository;
  final void Function() _onChanged;

  Future<void> createTournament(
    Tournament tournament,
    List<TournamentChart> charts,
  ) async {
    await _repository.createTournament(tournament, charts);
    _onChanged();
  }

  Future<List<Tournament>> fetchAll() {
    return _repository.fetchAll();
  }

  Future<Tournament?> fetchByUuid(String uuid) {
    return _repository.fetchByUuid(uuid);
  }

  Future<bool> exists(String uuid) {
    return _repository.exists(uuid);
  }

  Future<List<TournamentChart>> fetchCharts(String uuid) {
    return _repository.fetchCharts(uuid);
  }

  Future<Map<String, int>> countChartsByTournament() {
    return _repository.countChartsByTournament();
  }

  Future<void> deleteTournament(String uuid) async {
    await _repository.deleteTournament(uuid);
    _onChanged();
  }

  Future<void> updateBackgroundImage(
    String uuid,
    String? backgroundImagePath,
    String updatedAt,
  ) async {
    await _repository.updateBackgroundImage(uuid, backgroundImagePath, updatedAt);
    _onChanged();
  }
}

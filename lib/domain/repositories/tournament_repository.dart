import '../../data/models/tournament.dart';
import '../../data/models/tournament_chart.dart';

abstract class TournamentRepositoryContract {
  Future<void> createTournament(
    Tournament tournament,
    List<TournamentChart> charts,
  );

  Future<List<Tournament>> fetchAll();
  Future<Tournament?> fetchByUuid(String uuid);
  Future<bool> exists(String uuid);
  Future<List<TournamentChart>> fetchCharts(String uuid);
  Future<Map<String, int>> countChartsByTournament();
  Future<void> deleteTournament(String uuid);
  Future<void> updateBackgroundImage(
    String uuid,
    String? backgroundImagePath,
    String updatedAt,
  );
}

import '../../domain/repositories/tournament_repository.dart';
import '../../data/models/tournament.dart';
import '../../data/models/tournament_chart.dart';

/// 大会に関するユースケースを集約するアプリケーション層。
class TournamentUseCase {
  TournamentUseCase(
    this._repository, {
    required void Function() onChanged,
  }) : _onChanged = onChanged;

  final TournamentRepositoryContract _repository;
  final void Function() _onChanged;

  /// 大会と譜面一覧を作成し、一覧更新通知を発火する。
  Future<void> createTournament(
    Tournament tournament,
    List<TournamentChart> charts,
  ) async {
    await _repository.createTournament(tournament, charts);
    _onChanged();
  }

  /// 全大会を取得する。
  Future<List<Tournament>> fetchAll() {
    return _repository.fetchAll();
  }

  /// UUIDで大会を取得する。
  Future<Tournament?> fetchByUuid(String uuid) {
    return _repository.fetchByUuid(uuid);
  }

  /// 同一UUIDの大会が存在するか確認する。
  Future<bool> exists(String uuid) {
    return _repository.exists(uuid);
  }

  /// 大会に紐づく譜面一覧を取得する。
  Future<List<TournamentChart>> fetchCharts(String uuid) {
    return _repository.fetchCharts(uuid);
  }

  /// 大会ごとの譜面件数を取得する。
  Future<Map<String, int>> countChartsByTournament() {
    return _repository.countChartsByTournament();
  }

  /// 大会を削除し、一覧更新通知を発火する。
  Future<void> deleteTournament(String uuid) async {
    await _repository.deleteTournament(uuid);
    _onChanged();
  }

  /// 大会背景画像パスを更新し、一覧更新通知を発火する。
  Future<void> updateBackgroundImage(
    String uuid,
    String? backgroundImagePath,
    String updatedAt,
  ) async {
    await _repository.updateBackgroundImage(uuid, backgroundImagePath, updatedAt);
    _onChanged();
  }
}

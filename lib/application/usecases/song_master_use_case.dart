import '../../data/db/song_master_database.dart';
import '../../data/models/song_master.dart';
import '../../domain/repositories/song_master_repository.dart';
import '../../services/song_master_service.dart';

/// 曲マスタ参照・更新に関するユースケース。
class SongMasterUseCase {
  SongMasterUseCase(
    this._repository,
    this._service,
    this._database,
  );

  final SongMasterRepositoryContract _repository;
  final SongMasterService _service;
  final SongMasterDatabase _database;

  /// GitHubとの差分を確認し、必要であれば曲マスタを更新する。
  Future<SongMasterUpdateResult> checkAndUpdateIfNeeded() {
    return _service.checkAndUpdateIfNeeded();
  }

  /// ローカル曲マスタDBを削除する。
  Future<void> resetDatabase() {
    return _database.reset();
  }

  /// 有効曲一覧を取得する。
  Future<List<SongMasterMusic>> fetchActiveMusic() {
    return _repository.fetchActiveMusic();
  }

  /// 曲IDに紐づく譜面一覧を取得する。
  Future<List<SongMasterChart>> fetchChartsByMusic(int musicId) {
    return _repository.fetchChartsByMusic(musicId);
  }

  /// 譜面IDで譜面情報を取得する。
  Future<SongMasterChart?> fetchChartById(int chartId) {
    return _repository.fetchChartById(chartId);
  }

  /// 曲IDで曲情報を取得する。
  Future<SongMasterMusic?> fetchMusicById(int musicId) {
    return _repository.fetchMusicById(musicId);
  }
}

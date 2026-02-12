import '../../data/db/song_master_database.dart';
import '../../data/models/song_master.dart';
import '../../domain/repositories/song_master_repository.dart';
import '../../services/song_master_service.dart';

class SongMasterUseCase {
  SongMasterUseCase(
    this._repository,
    this._service,
    this._database,
  );

  final SongMasterRepositoryContract _repository;
  final SongMasterService _service;
  final SongMasterDatabase _database;

  Future<SongMasterUpdateResult> checkAndUpdateIfNeeded() {
    return _service.checkAndUpdateIfNeeded();
  }

  Future<void> resetDatabase() {
    return _database.reset();
  }

  Future<List<SongMasterMusic>> fetchActiveMusic() {
    return _repository.fetchActiveMusic();
  }

  Future<List<SongMasterChart>> fetchChartsByMusic(int musicId) {
    return _repository.fetchChartsByMusic(musicId);
  }

  Future<SongMasterChart?> fetchChartById(int chartId) {
    return _repository.fetchChartById(chartId);
  }

  Future<SongMasterMusic?> fetchMusicById(int musicId) {
    return _repository.fetchMusicById(musicId);
  }
}

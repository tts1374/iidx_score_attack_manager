import '../../data/models/song_master.dart';

abstract class SongMasterRepositoryContract {
  Future<List<SongMasterMusic>> searchMusic(String keyword);
  Future<List<SongMasterMusic>> fetchActiveMusic();
  Future<List<SongMasterChart>> fetchChartsByMusic(int musicId);
  Future<SongMasterChart?> fetchChartById(int chartId);
  Future<SongMasterMusic?> fetchMusicById(int musicId);
  Future<String?> fetchMetaValue(String key);
}

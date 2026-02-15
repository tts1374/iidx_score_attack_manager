class SongMasterMusic {
  SongMasterMusic({
    required this.musicId,
    required this.title,
    required this.version,
    required this.isAcActive,
    required this.isInfActive,
  });

  final int musicId;
  final String title;
  final String version;
  final int isAcActive;
  final int isInfActive;

  factory SongMasterMusic.fromMap(Map<String, Object?> map) {
    return SongMasterMusic(
      musicId: map['music_id'] as int,
      title: map['title'] as String,
      version: map['version'] as String? ?? '',
      isAcActive: map['is_ac_active'] as int? ?? 1,
      isInfActive: map['is_inf_active'] as int? ?? 0,
    );
  }
}

class SongMasterChart {
  SongMasterChart({
    required this.chartId,
    required this.musicId,
    required this.playStyle,
    required this.difficulty,
    required this.level,
    required this.isActive,
  });

  final int chartId;
  final int musicId;
  final String playStyle;
  final String difficulty;
  final int level;
  final int isActive;

  factory SongMasterChart.fromMap(Map<String, Object?> map) {
    return SongMasterChart(
      chartId: map['chart_id'] as int,
      musicId: map['music_id'] as int,
      playStyle: map['play_style'] as String? ?? '',
      difficulty: map['difficulty'] as String? ?? '',
      level: map['level'] as int? ?? 0,
      isActive: map['is_active'] as int? ?? 1,
    );
  }
}

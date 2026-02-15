class Tournament {
  Tournament({
    required this.tournamentUuid,
    required this.tournamentName,
    required this.owner,
    required this.hashtag,
    required this.startDate,
    required this.endDate,
    required this.isImported,
    required this.backgroundImagePath,
    required this.createdAt,
    required this.updatedAt,
  });

  final String tournamentUuid;
  final String tournamentName;
  final String owner;
  final String hashtag;
  final String startDate;
  final String endDate;
  final bool isImported;
  final String? backgroundImagePath;
  final String createdAt;
  final String updatedAt;

  Map<String, Object?> toMap() {
    return {
      'tournament_uuid': tournamentUuid,
      'tournament_name': tournamentName,
      'owner': owner,
      'hashtag': hashtag,
      'start_date': startDate,
      'end_date': endDate,
      'is_imported': isImported ? 1 : 0,
      'background_image_path': backgroundImagePath,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }

  factory Tournament.fromMap(Map<String, Object?> map) {
    return Tournament(
      tournamentUuid: map['tournament_uuid'] as String,
      tournamentName: map['tournament_name'] as String,
      owner: map['owner'] as String,
      hashtag: map['hashtag'] as String,
      startDate: map['start_date'] as String,
      endDate: map['end_date'] as String,
      isImported: (map['is_imported'] as int? ?? 0) == 1,
      backgroundImagePath: map['background_image_path'] as String?,
      createdAt: map['created_at'] as String,
      updatedAt: map['updated_at'] as String,
    );
  }
}

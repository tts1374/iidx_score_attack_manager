class Evidence {
  Evidence({
    required this.evidenceId,
    required this.tournamentUuid,
    required this.chartId,
    required this.filePath,
    required this.originalFilename,
    required this.mimeType,
    required this.fileSize,
    required this.width,
    required this.height,
    required this.sha256,
    required this.updateSeq,
    required this.lastUpdatedAt,
    required this.postedFlagCreate,
    required this.postedFlagUpdate,
    required this.lastPostedAt,
  });

  final int? evidenceId;
  final String tournamentUuid;
  final int chartId;
  final String filePath;
  final String originalFilename;
  final String mimeType;
  final int fileSize;
  final int width;
  final int height;
  final String sha256;
  final int updateSeq;
  final String lastUpdatedAt;
  final int postedFlagCreate;
  final int postedFlagUpdate;
  final String? lastPostedAt;

  Map<String, Object?> toMap() {
    return {
      'evidence_id': evidenceId,
      'tournament_uuid': tournamentUuid,
      'chart_id': chartId,
      'file_path': filePath,
      'original_filename': originalFilename,
      'mime_type': mimeType,
      'file_size': fileSize,
      'width': width,
      'height': height,
      'sha256': sha256,
      'update_seq': updateSeq,
      'last_updated_at': lastUpdatedAt,
      'posted_flag_create': postedFlagCreate,
      'posted_flag_update': postedFlagUpdate,
      'last_posted_at': lastPostedAt,
    };
  }

  factory Evidence.fromMap(Map<String, Object?> map) {
    return Evidence(
      evidenceId: map['evidence_id'] as int?,
      tournamentUuid: map['tournament_uuid'] as String,
      chartId: map['chart_id'] as int,
      filePath: map['file_path'] as String,
      originalFilename: map['original_filename'] as String,
      mimeType: map['mime_type'] as String,
      fileSize: map['file_size'] as int,
      width: map['width'] as int,
      height: map['height'] as int,
      sha256: map['sha256'] as String,
      updateSeq: map['update_seq'] as int,
      lastUpdatedAt: map['last_updated_at'] as String,
      postedFlagCreate: map['posted_flag_create'] as int,
      postedFlagUpdate: map['posted_flag_update'] as int,
      lastPostedAt: map['last_posted_at'] as String?,
    );
  }
}

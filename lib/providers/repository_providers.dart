import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/repositories/app_settings_repository.dart';
import '../data/repositories/evidence_repository.dart';
import '../data/repositories/song_master_repository.dart';
import '../data/repositories/tournament_repository.dart';
import '../domain/repositories/app_settings_repository.dart';
import '../domain/repositories/evidence_repository.dart';
import '../domain/repositories/song_master_repository.dart';
import '../domain/repositories/tournament_repository.dart';
import 'data_source_providers.dart';

final appSettingsRepositoryProvider = Provider<AppSettingsRepositoryContract>((ref) {
  return AppSettingsRepository(ref.read(appDataSourceProvider));
});

final tournamentRepositoryProvider = Provider<TournamentRepositoryContract>((ref) {
  return TournamentRepository(ref.read(appDataSourceProvider));
});

final evidenceRepositoryProvider = Provider<EvidenceRepositoryContract>((ref) {
  return EvidenceRepository(ref.read(appDataSourceProvider));
});

final songMasterRepositoryProvider = Provider<SongMasterRepositoryContract>((ref) {
  return SongMasterRepository(ref.read(songMasterDataSourceProvider));
});

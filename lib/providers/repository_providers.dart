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

/// 設定値Repository（抽象契約）を返すProvider。
final appSettingsRepositoryProvider = Provider<AppSettingsRepositoryContract>((ref) {
  return AppSettingsRepository(ref.read(appDataSourceProvider));
});

/// 大会Repository（抽象契約）を返すProvider。
final tournamentRepositoryProvider = Provider<TournamentRepositoryContract>((ref) {
  return TournamentRepository(ref.read(appDataSourceProvider));
});

/// エビデンスRepository（抽象契約）を返すProvider。
final evidenceRepositoryProvider = Provider<EvidenceRepositoryContract>((ref) {
  return EvidenceRepository(ref.read(appDataSourceProvider));
});

/// 曲マスタRepository（抽象契約）を返すProvider。
final songMasterRepositoryProvider = Provider<SongMasterRepositoryContract>((ref) {
  return SongMasterRepository(ref.read(songMasterDataSourceProvider));
});

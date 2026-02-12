import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/usecases/evidence_use_case.dart';
import '../application/usecases/settings_use_case.dart';
import '../application/usecases/song_master_use_case.dart';
import '../application/usecases/tournament_use_case.dart';
import '../services/evidence_service.dart';
import '../services/song_master_service.dart';
import '../services/tournament_import_service.dart';
import 'data_source_providers.dart';
import 'repository_providers.dart';

/// 大会データ更新通知用のインクリメントカウンタ。
final tournamentsChangedProvider = StateProvider<int>((ref) {
  return 0;
});

/// 曲マスタ更新サービスProvider。
final songMasterServiceProvider = Provider<SongMasterService>((ref) {
  return SongMasterService(
    ref.read(appSettingsRepositoryProvider),
    ref.read(songMasterDataSourceProvider),
  );
});

/// エビデンス保存サービスProvider。
final evidenceServiceProvider = Provider<EvidenceService>((ref) {
  return EvidenceService(ref.read(evidenceRepositoryProvider));
});

/// 大会ユースケースProvider。
final tournamentUseCaseProvider = Provider<TournamentUseCase>((ref) {
  return TournamentUseCase(
    ref.read(tournamentRepositoryProvider),
    onChanged: () {
      ref.read(tournamentsChangedProvider.notifier).state++;
    },
  );
});

/// 曲マスタユースケースProvider。
final songMasterUseCaseProvider = Provider<SongMasterUseCase>((ref) {
  return SongMasterUseCase(
    ref.read(songMasterRepositoryProvider),
    ref.read(songMasterServiceProvider),
    ref.read(songMasterDataSourceProvider),
  );
});

/// エビデンスユースケースProvider。
final evidenceUseCaseProvider = Provider<EvidenceUseCase>((ref) {
  return EvidenceUseCase(
    ref.read(evidenceRepositoryProvider),
    ref.read(evidenceServiceProvider),
  );
});

/// 設定ユースケースProvider。
final settingsUseCaseProvider = Provider<SettingsUseCase>((ref) {
  return SettingsUseCase(ref.read(appSettingsRepositoryProvider));
});

/// QR取込ユースケース（サービス）Provider。
final tournamentImportUseCaseProvider = Provider<TournamentImportService>((ref) {
  return TournamentImportService(
    qrService: ref.read(qrServiceDataSourceProvider),
    tournamentRepository: ref.read(tournamentRepositoryProvider),
    songMasterRepository: ref.read(songMasterRepositoryProvider),
    onChanged: () {
      ref.read(tournamentsChangedProvider.notifier).state++;
    },
  );
});

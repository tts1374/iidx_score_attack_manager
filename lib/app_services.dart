import 'data/db/app_database.dart';
import 'data/db/song_master_database.dart';
import 'data/repositories/app_settings_repository.dart';
import 'data/repositories/evidence_repository.dart';
import 'data/repositories/song_master_repository.dart';
import 'data/repositories/tournament_repository.dart';
import 'services/evidence_service.dart';
import 'services/qr_service.dart';
import 'services/song_master_service.dart';

class AppServices {
  AppServices._();

  static final AppServices instance = AppServices._();

  final AppDatabase appDb = AppDatabase.instance;
  final SongMasterDatabase songMasterDb = SongMasterDatabase.instance;

  late final AppSettingsRepository settingsRepo =
      AppSettingsRepository(appDb);
  late final TournamentRepository tournamentRepo =
      TournamentRepository(appDb);
  late final EvidenceRepository evidenceRepo = EvidenceRepository(appDb);
  late final SongMasterRepository songMasterRepo =
      SongMasterRepository(songMasterDb);

  late final SongMasterService songMasterService =
      SongMasterService(settingsRepo, songMasterDb);
  late final EvidenceService evidenceService =
      EvidenceService(evidenceRepo);
  final QrService qrService = QrService();
}

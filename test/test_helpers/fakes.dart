import 'dart:async';
import 'dart:io';

import 'package:flutter_sharing_intent/model/sharing_file.dart';
import 'package:iidx_score_attack_manager/application/usecases/evidence_use_case.dart';
import 'package:iidx_score_attack_manager/application/usecases/song_master_use_case.dart';
import 'package:iidx_score_attack_manager/core/date_utils.dart';
import 'package:iidx_score_attack_manager/data/db/song_master_database.dart';
import 'package:iidx_score_attack_manager/data/models/evidence.dart';
import 'package:iidx_score_attack_manager/data/models/song_master.dart';
import 'package:iidx_score_attack_manager/data/models/tournament.dart';
import 'package:iidx_score_attack_manager/data/models/tournament_chart.dart';
import 'package:iidx_score_attack_manager/domain/repositories/app_settings_repository.dart';
import 'package:iidx_score_attack_manager/domain/repositories/evidence_repository.dart';
import 'package:iidx_score_attack_manager/domain/repositories/song_master_repository.dart';
import 'package:iidx_score_attack_manager/domain/repositories/tournament_repository.dart';
import 'package:iidx_score_attack_manager/providers/system_providers.dart';
import 'package:iidx_score_attack_manager/services/evidence_service.dart';
import 'package:iidx_score_attack_manager/services/qr_from_image_service.dart';
import 'package:iidx_score_attack_manager/services/share_intent_service.dart';
import 'package:iidx_score_attack_manager/services/song_master_service.dart';
import 'package:image_picker/image_picker.dart';

class FakeAppSettingsRepository implements AppSettingsRepositoryContract {
  final Map<String, String> _values;

  FakeAppSettingsRepository([Map<String, String>? initial]) : _values = initial ?? {};

  @override
  Future<String?> getValue(String key) async => _values[key];

  @override
  Future<void> setValue(String key, String value) async {
    _values[key] = value;
  }
}

class FakeSongMasterRepository implements SongMasterRepositoryContract {
  FakeSongMasterRepository({
    List<SongMasterMusic>? activeMusic,
    Map<int, SongMasterChart>? chartsById,
  })  : _activeMusic = activeMusic ?? <SongMasterMusic>[],
        _chartsById = chartsById ?? <int, SongMasterChart>{};

  final List<SongMasterMusic> _activeMusic;
  final Map<int, SongMasterChart> _chartsById;

  @override
  Future<SongMasterChart?> fetchChartById(int chartId) async => _chartsById[chartId];

  @override
  Future<List<SongMasterChart>> fetchChartsByMusic(int musicId) async {
    return _chartsById.values.where((c) => c.musicId == musicId).toList();
  }

  @override
  Future<List<SongMasterMusic>> fetchActiveMusic() async => _activeMusic;

  @override
  Future<String?> fetchMetaValue(String key) async => null;

  @override
  Future<SongMasterMusic?> fetchMusicById(int musicId) async {
    for (final music in _activeMusic) {
      if (music.musicId == musicId) {
        return music;
      }
    }
    return null;
  }

  @override
  Future<List<SongMasterMusic>> searchMusic(String keyword) async {
    return _activeMusic.where((m) => m.title.contains(keyword)).toList();
  }
}

class FakeSongMasterService extends SongMasterService {
  FakeSongMasterService(this._result)
      : super(FakeAppSettingsRepository(), SongMasterDatabase.instance);

  final SongMasterUpdateResult _result;

  @override
  Future<SongMasterUpdateResult> checkAndUpdateIfNeeded() async => _result;
}

SongMasterUseCase buildFakeSongMasterUseCase({
  SongMasterUpdateResult result = const SongMasterUpdateResult(
    SongMasterUpdateStatus.upToDate,
  ),
  List<SongMasterMusic>? activeMusic,
  Map<int, SongMasterChart>? chartsById,
}) {
  final repo = FakeSongMasterRepository(
    activeMusic: activeMusic,
    chartsById: chartsById,
  );
  return SongMasterUseCase(
    repo,
    FakeSongMasterService(result),
    SongMasterDatabase.instance,
  );
}

class FakeTournamentRepository implements TournamentRepositoryContract {
  FakeTournamentRepository({
    List<Tournament>? tournaments,
    Map<String, List<TournamentChart>>? chartsByTournament,
  })  : _tournaments = {
          for (final t in tournaments ?? <Tournament>[]) t.tournamentUuid: t,
        },
        _chartsByTournament = chartsByTournament ?? <String, List<TournamentChart>>{};

  final Map<String, Tournament> _tournaments;
  final Map<String, List<TournamentChart>> _chartsByTournament;

  @override
  Future<void> createTournament(
    Tournament tournament,
    List<TournamentChart> charts,
  ) async {
    _tournaments[tournament.tournamentUuid] = tournament;
    _chartsByTournament[tournament.tournamentUuid] = List<TournamentChart>.from(charts);
  }

  @override
  Future<void> deleteTournament(String uuid) async {
    _tournaments.remove(uuid);
    _chartsByTournament.remove(uuid);
  }

  @override
  Future<bool> exists(String uuid) async => _tournaments.containsKey(uuid);

  @override
  Future<List<Tournament>> fetchAll() async => _tournaments.values.toList();

  @override
  Future<Tournament?> fetchByUuid(String uuid) async => _tournaments[uuid];

  @override
  Future<List<TournamentChart>> fetchCharts(String uuid) async {
    return List<TournamentChart>.from(_chartsByTournament[uuid] ?? <TournamentChart>[]);
  }

  @override
  Future<Map<String, int>> countChartsByTournament() async {
    final result = <String, int>{};
    _chartsByTournament.forEach((key, value) {
      result[key] = value.length;
    });
    return result;
  }

  @override
  Future<void> updateBackgroundImage(
    String uuid,
    String? backgroundImagePath,
    String updatedAt,
  ) async {
    final current = _tournaments[uuid];
    if (current == null) return;
    _tournaments[uuid] = Tournament(
      tournamentUuid: current.tournamentUuid,
      tournamentName: current.tournamentName,
      owner: current.owner,
      hashtag: current.hashtag,
      startDate: current.startDate,
      endDate: current.endDate,
      isImported: current.isImported,
      backgroundImagePath: backgroundImagePath,
      createdAt: current.createdAt,
      updatedAt: updatedAt,
    );
  }
}

class FakeEvidenceRepository implements EvidenceRepositoryContract {
  FakeEvidenceRepository({
    List<Evidence>? evidences,
  }) : _evidences = {
          for (final e in evidences ?? <Evidence>[]) _key(e.tournamentUuid, e.chartId): e,
        };

  final Map<String, Evidence> _evidences;

  static String _key(String uuid, int chartId) => '$uuid::$chartId';

  @override
  Future<int> countSubmittedByTournament(String uuid) async {
    return _evidences.values.where((e) => e.tournamentUuid == uuid).length;
  }

  @override
  Future<Map<String, int>> countSubmittedByTournamentAll() async {
    final result = <String, int>{};
    for (final evidence in _evidences.values) {
      result[evidence.tournamentUuid] = (result[evidence.tournamentUuid] ?? 0) + 1;
    }
    return result;
  }

  @override
  Future<void> deleteEvidence(String uuid, int chartId) async {
    _evidences.remove(_key(uuid, chartId));
  }

  @override
  Future<Evidence?> fetchEvidence(String uuid, int chartId) async {
    return _evidences[_key(uuid, chartId)];
  }

  @override
  Future<List<Evidence>> fetchEvidencesByTournament(String uuid) async {
    return _evidences.values.where((e) => e.tournamentUuid == uuid).toList();
  }

  @override
  Future<void> markUpdatePosted({
    required int evidenceId,
    required String postedAt,
  }) async {
    for (final entry in _evidences.entries) {
      if (entry.value.evidenceId == evidenceId) {
        final e = entry.value;
        _evidences[entry.key] = Evidence(
          evidenceId: e.evidenceId,
          tournamentUuid: e.tournamentUuid,
          chartId: e.chartId,
          filePath: e.filePath,
          originalFilename: e.originalFilename,
          mimeType: e.mimeType,
          fileSize: e.fileSize,
          width: e.width,
          height: e.height,
          sha256: e.sha256,
          updateSeq: e.updateSeq,
          lastUpdatedAt: e.lastUpdatedAt,
          postedFlagCreate: e.postedFlagCreate,
          postedFlagUpdate: 1,
          lastPostedAt: postedAt,
        );
      }
    }
  }

  @override
  Future<void> upsertEvidence(Evidence evidence) async {
    _evidences[_key(evidence.tournamentUuid, evidence.chartId)] = evidence;
  }
}

EvidenceUseCase buildFakeEvidenceUseCase(
  FakeEvidenceRepository repository, {
  DateTime Function()? now,
  Future<Directory> Function()? appSupportDirectory,
  FileSystemPort? fileSystem,
}) {
  return EvidenceUseCase(
    repository,
    EvidenceService(
      repository,
      nowJst: now ?? nowJst,
      appSupportDirectory: appSupportDirectory ??
          () async => Directory.systemTemp.createTemp('evidence_test_'),
      fileSystem: fileSystem ?? const IoFileSystemPort(),
    ),
  );
}

class FakeShareIntentService extends ShareIntentService {
  FakeShareIntentService({
    List<SharedFile>? initialFiles,
  }) : _initialFiles = initialFiles ?? <SharedFile>[];

  final List<SharedFile> _initialFiles;
  final StreamController<List<SharedFile>> _controller =
      StreamController<List<SharedFile>>.broadcast();

  @override
  Future<List<SharedFile>> getInitialFiles() async => _initialFiles;

  @override
  Stream<List<SharedFile>> mediaStream() => _controller.stream;

  void emit(List<SharedFile> files) {
    _controller.add(files);
  }

  @override
  void reset() {}
}

class FakeQrFromImageService extends QrFromImageService {
  FakeQrFromImageService(this._resolver);

  final Future<String?> Function(String path) _resolver;

  @override
  Future<String?> tryExtractQrRawValue(String imagePath) {
    return _resolver(imagePath);
  }
}

class FakeImagePickerService {
  FakeImagePickerService(this._picker);

  final Future<XFile?> Function(ImageSource source) _picker;

  Future<XFile?> pickImage({required ImageSource source}) {
    return _picker(source);
  }
}


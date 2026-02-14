import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart' as rp;
import 'package:flutter_sharing_intent/model/sharing_file.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:iidx_score_attack_manager/data/db/app_database.dart';
import 'package:iidx_score_attack_manager/data/models/song_master.dart';
import 'package:iidx_score_attack_manager/providers/data_source_providers.dart';
import 'package:iidx_score_attack_manager/providers/repository_providers.dart';
import 'package:iidx_score_attack_manager/providers/system_providers.dart';
import 'package:iidx_score_attack_manager/providers/use_case_providers.dart';
import 'package:iidx_score_attack_manager/services/qr_service.dart';
import 'package:iidx_score_attack_manager/services/song_master_service.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../test_helpers/fakes.dart';
import '../test_helpers/provider_container_helper.dart' as test_container;

class _FakeFileSystemPort implements FileSystemPort {
  _FakeFileSystemPort(this._existingPaths);

  final Set<String> _existingPaths;

  @override
  Future<void> delete(String path) async {
    _existingPaths.remove(path);
  }

  @override
  Future<bool> exists(String path) async {
    return _existingPaths.contains(path);
  }

  @override
  Future<void> writeAsBytes(
    String path,
    List<int> bytes, {
    bool flush = false,
  }) async {
    _existingPaths.add(path);
  }
}

List<rp.Override> _buildOverrides({
  required AppDatabase appDatabase,
  required DateTime fixedNow,
  required FakeShareIntentService shareIntentService,
  required FakeQrFromImageService qrFromImageService,
  required FakeSongMasterRepository songMasterRepository,
  required FileSystemPort fileSystem,
}) {
  return [
    nowJstProvider.overrideWithValue(() => fixedNow),
    appDataSourceProvider.overrideWithValue(appDatabase),
    shareIntentDataSourceProvider.overrideWithValue(shareIntentService),
    qrFromImageDataSourceProvider.overrideWithValue(qrFromImageService),
    songMasterRepositoryProvider.overrideWithValue(songMasterRepository),
    songMasterUseCaseProvider.overrideWithValue(
      buildFakeSongMasterUseCase(
        result: const SongMasterUpdateResult(SongMasterUpdateStatus.upToDate),
      ),
    ),
    fileSystemProvider.overrideWithValue(fileSystem),
  ];
}

Future<bool> _handleSharedImportWithProviders(
  rp.ProviderContainer container,
) async {
  final shareIntentService = container.read(shareIntentDataSourceProvider);
  final files = await shareIntentService.getInitialFiles();
  final imagePaths = files
      .where((f) => f.type == SharedMediaType.IMAGE)
      .map((f) => f.value)
      .whereType<String>()
      .toList();
  if (imagePaths.isEmpty) {
    return false;
  }

  final fileSystem = container.read(fileSystemProvider);
  final qrFromImage = container.read(qrFromImageDataSourceProvider);
  final importer = container.read(tournamentImportUseCaseProvider);

  for (final path in imagePaths) {
    if (!await fileSystem.exists(path)) {
      continue;
    }
    final raw = await qrFromImage.tryExtractQrRawValue(path);
    if (raw == null || raw.isEmpty) {
      continue;
    }
    final result = await importer.importFromQrRawValue(raw);
    return result.success;
  }
  return false;
}

void main() {
  test('sharing intent(fake) -> QR抽出(fake) -> 登録 -> 永続化 -> 再起動復元', () async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;

    final fixedNow = DateTime.parse('2026-02-14 09:00:00+09:00');
    final sharedImagePath = '/fake/shared_qr_image.png';
    final tournamentUuid = 'integration-uuid-1';
    final tournamentName = 'integration_tournament';

    final payload = <String, dynamic>{
      'tournament_uuid': tournamentUuid,
      'tournament_name': tournamentName,
      'owner': 'owner',
      'hashtag': 'integration_hash',
      'start_date': '2026-02-10',
      'end_date': '2026-02-20',
      'created_at': '2026-02-01T00:00:00Z',
      'charts': [
        {'music_id': 1, 'chart_id': 101, 'sort_order': 1},
      ],
    };
    final rawQr = QrService().encodeTournament(payload);

    final songMasterRepository = FakeSongMasterRepository(
      chartsById: {
        101: SongMasterChart(
          chartId: 101,
          musicId: 1,
          playStyle: 'SP',
          difficulty: 'HYPER',
          level: 10,
          isActive: 1,
        ),
      },
    );

    final dbPath = p.join(
      Directory.current.path,
      'app_data_integration_${DateTime.now().microsecondsSinceEpoch}.sqlite',
    );
    addTearDown(() async {
      final file = File(dbPath);
      if (await file.exists()) {
        await file.delete();
      }
    });
    final appDatabase = AppDatabase(
      resolvePath: () async => dbPath,
      openDatabase: (
        path, {
        int? version,
        OnDatabaseCreateFn? onCreate,
      }) {
        return openDatabase(path, version: version, onCreate: onCreate);
      },
    );

    final shareIntentService = FakeShareIntentService(
      initialFiles: [
        SharedFile(
          value: sharedImagePath,
          type: SharedMediaType.IMAGE,
          mimeType: 'image/png',
        ),
      ],
    );
    final qrFromImageService = FakeQrFromImageService((path) async {
      if (path == sharedImagePath) {
        return rawQr;
      }
      return null;
    });
    final fileSystem = _FakeFileSystemPort({sharedImagePath});

    final firstContainer = test_container.ProviderContainer.test(
      overrides: _buildOverrides(
        appDatabase: appDatabase,
        fixedNow: fixedNow,
        shareIntentService: shareIntentService,
        qrFromImageService: qrFromImageService,
        songMasterRepository: songMasterRepository,
        fileSystem: fileSystem,
      ),
    );
    addTearDown(firstContainer.dispose);

    final imported = await _handleSharedImportWithProviders(firstContainer);
    expect(imported, isTrue);

    final tournamentUseCase = firstContainer.read(tournamentUseCaseProvider);
    final firstRun = await tournamentUseCase.fetchAll();
    expect(firstRun.length, 1);
    expect(firstRun.first.tournamentUuid, tournamentUuid);

    await appDatabase.close();
    firstContainer.dispose();

    final reopenedDb = AppDatabase(
      resolvePath: () async => dbPath,
      openDatabase: (
        path, {
        int? version,
        OnDatabaseCreateFn? onCreate,
      }) {
        return openDatabase(path, version: version, onCreate: onCreate);
      },
    );

    final secondContainer = test_container.ProviderContainer.test(
      overrides: _buildOverrides(
        appDatabase: reopenedDb,
        fixedNow: fixedNow,
        shareIntentService: FakeShareIntentService(initialFiles: const []),
        qrFromImageService: qrFromImageService,
        songMasterRepository: songMasterRepository,
        fileSystem: fileSystem,
      ),
    );
    addTearDown(secondContainer.dispose);

    final restoredTournaments = await secondContainer
        .read(tournamentUseCaseProvider)
        .fetchAll();
    expect(restoredTournaments.length, 1);
    expect(restoredTournaments.first.tournamentUuid, tournamentUuid);

    await reopenedDb.close();
  });
}

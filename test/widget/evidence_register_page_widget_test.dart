import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:iidx_score_attack_manager/application/usecases/tournament_use_case.dart';
import 'package:iidx_score_attack_manager/data/models/song_master.dart';
import 'package:iidx_score_attack_manager/data/models/tournament.dart';
import 'package:iidx_score_attack_manager/data/models/tournament_chart.dart';
import 'package:iidx_score_attack_manager/providers/data_source_providers.dart';
import 'package:iidx_score_attack_manager/providers/system_providers.dart';
import 'package:iidx_score_attack_manager/providers/use_case_providers.dart';
import 'package:iidx_score_attack_manager/services/image_picker_service.dart';
import 'package:iidx_score_attack_manager/services/song_master_service.dart';
import 'package:iidx_score_attack_manager/ui/pages/evidence_register_page.dart';
import 'package:image_picker/image_picker.dart';

import '../test_helpers/fakes.dart';

class FakeImagePickerService implements ImagePickerService {
  FakeImagePickerService(this._onPick);

  final Future<XFile?> Function(ImageSource source) _onPick;

  @override
  Future<XFile?> pickImage({required ImageSource source}) {
    return _onPick(source);
  }
}

Tournament _tournament() {
  return Tournament(
    tournamentUuid: 't-1',
    tournamentName: 'test tournament',
    owner: 'owner',
    hashtag: 'hash',
    startDate: '2026-02-10',
    endDate: '2026-02-20',
    isImported: false,
    backgroundImagePath: null,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  );
}

TournamentChart _chart() {
  return TournamentChart(
    tournamentChartId: null,
    tournamentUuid: 't-1',
    chartId: 101,
    sortOrder: 1,
    createdAt: '2026-02-01T00:00:00Z',
  );
}

SongMasterChart _chartInfo() {
  return SongMasterChart(
    chartId: 101,
    musicId: 301,
    playStyle: 'DP',
    difficulty: 'ANOTHER',
    level: 12,
    isActive: 1,
  );
}

SongMasterMusic _music() {
  return SongMasterMusic(
    musicId: 301,
    title: 'Test Song',
    version: '31',
    isAcActive: 1,
    isInfActive: 0,
  );
}

Widget _buildPage({
  required DateTime fixedNow,
  required Future<XFile?> Function(ImageSource source) onPickImage,
}) {
  final tournament = _tournament();
  final chart = _chart();
  final chartInfo = _chartInfo();
  final music = _music();

  final tournamentRepo = FakeTournamentRepository(
    tournaments: [tournament],
    chartsByTournament: {
      tournament.tournamentUuid: [chart],
    },
  );
  final evidenceRepo = FakeEvidenceRepository();

  return ProviderScope(
    overrides: [
      nowJstProvider.overrideWithValue(() => fixedNow),
      tournamentUseCaseProvider.overrideWithValue(
        TournamentUseCase(
          tournamentRepo,
          onChanged: () {},
        ),
      ),
      evidenceUseCaseProvider.overrideWithValue(
        buildFakeEvidenceUseCase(
          evidenceRepo,
          now: () => fixedNow,
        ),
      ),
      songMasterUseCaseProvider.overrideWithValue(
        buildFakeSongMasterUseCase(
          result: const SongMasterUpdateResult(SongMasterUpdateStatus.upToDate),
          activeMusic: [music],
          chartsById: {chartInfo.chartId: chartInfo},
        ),
      ),
      imagePickerDataSourceProvider.overrideWithValue(
        FakeImagePickerService(onPickImage),
      ),
    ],
    child: MaterialApp(
      home: Navigator(
        onGenerateRoute: (_) {
          return MaterialPageRoute<void>(
            settings: RouteSettings(
              name: EvidenceRegisterPage.routeName,
              arguments: EvidenceRegisterArgs(
                tournamentUuid: 't-1',
                chartId: 101,
              ),
            ),
            builder: (_) => const EvidenceRegisterPage(),
          );
        },
      ),
    ),
  );
}

Future<void> _pumpUntilVisible(
  WidgetTester tester,
  Finder finder, {
  Duration step = const Duration(milliseconds: 100),
  int maxTicks = 50,
}) async {
  for (var i = 0; i < maxTicks; i++) {
    await tester.pump(step);
    if (finder.evaluate().isNotEmpty) {
      return;
    }
  }
  fail('Widget not found: $finder');
}

void main() {
  testWidgets('submit button becomes enabled after selecting image in active period',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final fixedNow = DateTime.parse('2026-02-14 09:00:00+09:00');
    await tester.pumpWidget(
      _buildPage(
        fixedNow: fixedNow,
        onPickImage: (_) async => XFile('dummy.jpg'),
      ),
    );

    await _pumpUntilVisible(tester, find.byType(EvidenceRegisterPage));
    final firstError = tester.takeException();
    if (firstError != null) {
      fail('Unexpected exception: $firstError');
    }
    final submitFinder = find.byWidgetPredicate(
      (widget) => widget is ButtonStyleButton,
    );
    await _pumpUntilVisible(tester, submitFinder);

    var submit = tester.widget<ButtonStyleButton>(submitFinder);
    expect(submit.onPressed, isNull);

    await tester.ensureVisible(find.byIcon(Icons.image));
    await tester.tap(find.byIcon(Icons.image));
    await tester.pump();

    submit = tester.widget<ButtonStyleButton>(submitFinder);
    expect(submit.onPressed, isNotNull);
  });

  testWidgets('submit button stays disabled outside tournament period', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final fixedNow = DateTime.parse('2026-02-25 09:00:00+09:00');
    await tester.pumpWidget(
      _buildPage(
        fixedNow: fixedNow,
        onPickImage: (_) async => null,
      ),
    );

    await _pumpUntilVisible(tester, find.byType(EvidenceRegisterPage));
    final firstError = tester.takeException();
    if (firstError != null) {
      fail('Unexpected exception: $firstError');
    }
    final submitFinder = find.byWidgetPredicate(
      (widget) => widget is ButtonStyleButton,
    );
    await _pumpUntilVisible(tester, submitFinder);

    final submit = tester.widget<ButtonStyleButton>(submitFinder);
    expect(submit.onPressed, isNull);
  });
}

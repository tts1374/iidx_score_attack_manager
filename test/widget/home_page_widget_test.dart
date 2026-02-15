import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iidx_score_attack_manager/application/usecases/tournament_use_case.dart';
import 'package:iidx_score_attack_manager/data/models/evidence.dart';
import 'package:iidx_score_attack_manager/data/models/tournament.dart';
import 'package:iidx_score_attack_manager/data/models/tournament_chart.dart';
import 'package:iidx_score_attack_manager/providers/system_providers.dart';
import 'package:iidx_score_attack_manager/providers/use_case_providers.dart';
import 'package:iidx_score_attack_manager/services/song_master_service.dart';
import 'package:iidx_score_attack_manager/ui/pages/home_page.dart';

import '../test_helpers/fakes.dart';

Tournament _tournament({
  required String uuid,
  required String name,
  required String startDate,
  required String endDate,
}) {
  return Tournament(
    tournamentUuid: uuid,
    tournamentName: name,
    owner: 'owner',
    hashtag: 'hash',
    startDate: startDate,
    endDate: endDate,
    isImported: false,
    backgroundImagePath: null,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  );
}

TournamentChart _chart(String uuid, int chartId, int sortOrder) {
  return TournamentChart(
    tournamentChartId: null,
    tournamentUuid: uuid,
    chartId: chartId,
    sortOrder: sortOrder,
    createdAt: '2026-02-01T00:00:00Z',
  );
}

Evidence _evidence(String uuid, int chartId) {
  return Evidence(
    evidenceId: chartId,
    tournamentUuid: uuid,
    chartId: chartId,
    filePath: '/tmp/$uuid-$chartId.jpg',
    originalFilename: '$chartId.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1,
    width: 1,
    height: 1,
    sha256: 'hash-$chartId',
    updateSeq: 1,
    lastUpdatedAt: '2026-02-01T00:00:00Z',
    postedFlagCreate: 0,
    postedFlagUpdate: 0,
    lastPostedAt: null,
  );
}

Widget _buildPage({
  required DateTime fixedNow,
}) {
  final ongoing = _tournament(
    uuid: 'ongoing',
    name: '開催中大会',
    startDate: '2026-02-10',
    endDate: '2026-02-16',
  );
  final upcoming = _tournament(
    uuid: 'upcoming',
    name: '開催前大会',
    startDate: '2026-02-20',
    endDate: '2026-02-28',
  );
  final ended = _tournament(
    uuid: 'ended',
    name: '終了大会',
    startDate: '2026-02-01',
    endDate: '2026-02-05',
  );

  final tournamentRepo = FakeTournamentRepository(
    tournaments: [ongoing, upcoming, ended],
    chartsByTournament: {
      ongoing.tournamentUuid: [
        _chart(ongoing.tournamentUuid, 1, 1),
        _chart(ongoing.tournamentUuid, 2, 2),
        _chart(ongoing.tournamentUuid, 3, 3),
        _chart(ongoing.tournamentUuid, 4, 4),
      ],
      upcoming.tournamentUuid: [_chart(upcoming.tournamentUuid, 10, 1)],
      ended.tournamentUuid: [_chart(ended.tournamentUuid, 20, 1)],
    },
  );
  final evidenceRepo = FakeEvidenceRepository(
    evidences: [
      _evidence(ongoing.tournamentUuid, 1),
      _evidence(ongoing.tournamentUuid, 2),
    ],
  );

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
          result: const SongMasterUpdateResult(
            SongMasterUpdateStatus.upToDate,
          ),
        ),
      ),
    ],
    child: const MaterialApp(
      home: HomePage(),
    ),
  );
}

void main() {
  testWidgets('一覧タブを切り替えできる', (tester) async {
    final fixedNow = DateTime.parse('2026-02-14 09:00:00+09:00');

    await tester.pumpWidget(_buildPage(fixedNow: fixedNow));
    await tester.pumpAndSettle();

    expect(find.text('開催中大会'), findsOneWidget);
    expect(find.text('開催前大会'), findsNothing);
    expect(find.text('終了大会'), findsNothing);

    await tester.tap(find.text('開催前'));
    await tester.pumpAndSettle();
    expect(find.text('開催前大会'), findsOneWidget);
    expect(find.text('開催中大会'), findsNothing);

    await tester.tap(find.text('終了'));
    await tester.pumpAndSettle();
    expect(find.text('終了大会'), findsOneWidget);
    expect(find.text('開催前大会'), findsNothing);
  });

  testWidgets('開催中タブで残り日数を表示する', (tester) async {
    final fixedNow = DateTime.parse('2026-02-14 09:00:00+09:00');

    await tester.pumpWidget(_buildPage(fixedNow: fixedNow));
    await tester.pumpAndSettle();

    expect(find.text('残り2日'), findsOneWidget);
  });

  testWidgets('提出進捗を表示する', (tester) async {
    final fixedNow = DateTime.parse('2026-02-14 09:00:00+09:00');

    await tester.pumpWidget(_buildPage(fixedNow: fixedNow));
    await tester.pumpAndSettle();

    expect(find.text('提出: 2/4'), findsOneWidget);
  });
}

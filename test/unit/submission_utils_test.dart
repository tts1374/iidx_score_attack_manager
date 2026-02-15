import 'package:flutter_test/flutter_test.dart';
import 'package:iidx_score_attack_manager/core/submission_utils.dart';
import 'package:iidx_score_attack_manager/data/models/evidence.dart';

Evidence _evidence({required int postedFlagUpdate}) {
  return Evidence(
    evidenceId: 1,
    tournamentUuid: 'uuid',
    chartId: 1,
    filePath: 'a.png',
    originalFilename: 'a.png',
    mimeType: 'image/png',
    fileSize: 1,
    width: 1,
    height: 1,
    sha256: 'hash',
    updateSeq: 1,
    lastUpdatedAt: '2026-01-01T00:00:00Z',
    postedFlagCreate: 0,
    postedFlagUpdate: postedFlagUpdate,
    lastPostedAt: null,
  );
}

void main() {
  group('提出状態判定', () {
    test('未登録', () {
      expect(
        resolveChartSubmissionState(null),
        ChartSubmissionState.unregistered,
      );
    });

    test('登録済み・未投稿', () {
      expect(
        resolveChartSubmissionState(_evidence(postedFlagUpdate: 0)),
        ChartSubmissionState.pendingPost,
      );
    });

    test('登録済み・投稿済み', () {
      expect(
        resolveChartSubmissionState(_evidence(postedFlagUpdate: 1)),
        ChartSubmissionState.posted,
      );
    });

    test('投稿対象の有無を判定できる', () {
      final values = <Evidence?>[
        _evidence(postedFlagUpdate: 1),
        _evidence(postedFlagUpdate: 0),
      ];
      expect(hasPendingPostEvidence(values), isTrue);
      expect(
        hasPendingPostEvidence(<Evidence?>[_evidence(postedFlagUpdate: 1)]),
        isFalse,
      );
    });
  });
}

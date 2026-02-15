import 'package:flutter_test/flutter_test.dart';
import 'package:iidx_score_attack_manager/services/evidence_service.dart';

void main() {
  group('sha256/ファイル命名', () {
    test('sha256を正しく計算できる', () {
      final digest = computeSha256Hex('abc'.codeUnits);
      expect(
        digest,
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    test('ファイル名を仕様通りに生成できる', () {
      final filename = buildEvidenceFileName(
        tournamentUuid: 'uuid-1',
        chartId: 12,
        originalFileName: 'result.jpeg',
      );
      expect(filename, 'uuid-1_12.jpeg');

      final fallback = buildEvidenceFileName(
        tournamentUuid: 'uuid-2',
        chartId: 99,
        originalFileName: 'noext',
      );
      expect(fallback, 'uuid-2_99.jpg');
    });
  });
}

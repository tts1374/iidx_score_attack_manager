import 'package:flutter_test/flutter_test.dart';
import 'package:iidx_score_attack_manager/core/date_utils.dart';

void main() {
  group('開催状態判定', () {
    final fixedNow = DateTime.parse('2026-02-14 12:00:00+09:00');

    test('開催中', () {
      expect(
        isActiveTournament('2026-02-10', '2026-02-20', now: fixedNow),
        isTrue,
      );
      expect(isFutureTournament('2026-02-10', now: fixedNow), isFalse);
      expect(isPastTournament('2026-02-20', now: fixedNow), isFalse);
    });

    test('開催前', () {
      expect(isFutureTournament('2026-02-15', now: fixedNow), isTrue);
      expect(
        isActiveTournament('2026-02-15', '2026-02-20', now: fixedNow),
        isFalse,
      );
    });

    test('終了', () {
      expect(isPastTournament('2026-02-13', now: fixedNow), isTrue);
      expect(
        isActiveTournament('2026-02-01', '2026-02-13', now: fixedNow),
        isFalse,
      );
    });
  });
}

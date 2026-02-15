import 'package:flutter_test/flutter_test.dart';
import 'package:iidx_score_attack_manager/application/validators/tournament_input_validator.dart';

void main() {
  group('入力バリデーション', () {
    test('必須・最大長', () {
      expect(
        TournamentInputValidator.validateRequiredText(
          ' ',
          maxLength: 5,
          emptyMessage: 'empty',
          tooLongMessage: 'too_long',
        ),
        'empty',
      );
      expect(
        TournamentInputValidator.validateRequiredText(
          'abcdef',
          maxLength: 5,
          emptyMessage: 'empty',
          tooLongMessage: 'too_long',
        ),
        'too_long',
      );
      expect(
        TournamentInputValidator.validateRequiredText(
          'abc',
          maxLength: 5,
          emptyMessage: 'empty',
          tooLongMessage: 'too_long',
        ),
        isNull,
      );
    });

    test('日付範囲', () {
      final fixedNow = DateTime.parse('2026-02-14 12:00:00+09:00');

      expect(
        TournamentInputValidator.validateDateRange(
          startDate: null,
          endDate: '2026-02-20',
          now: fixedNow,
        ),
        isNotNull,
      );
      expect(
        TournamentInputValidator.validateDateRange(
          startDate: '2026-02-20',
          endDate: '2026-02-10',
          now: fixedNow,
        ),
        isNotNull,
      );
      expect(
        TournamentInputValidator.validateDateRange(
          startDate: '2026-02-01',
          endDate: '2026-02-10',
          now: fixedNow,
        ),
        isNotNull,
      );
      expect(
        TournamentInputValidator.validateDateRange(
          startDate: '2026-02-14',
          endDate: '2026-02-20',
          now: fixedNow,
        ),
        isNull,
      );
    });
  });
}

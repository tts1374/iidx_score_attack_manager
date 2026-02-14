import '../../core/date_utils.dart';

/// 大会作成入力のバリデーション。
class TournamentInputValidator {
  /// 文字列の必須/最大長を検証する。
  static String? validateRequiredText(
    String? value, {
    required int maxLength,
    required String emptyMessage,
    required String tooLongMessage,
  }) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) {
      return emptyMessage;
    }
    if (text.length > maxLength) {
      return tooLongMessage;
    }
    return null;
  }

  /// 大会期間を検証する。
  ///
  /// - 開始/終了未指定
  /// - 終了 < 開始
  /// - 過去大会
  static String? validateDateRange({
    required String? startDate,
    required String? endDate,
    required DateTime now,
  }) {
    if (startDate == null || endDate == null) {
      return '開始日と終了日を選択してください。';
    }
    if (endDate.compareTo(startDate) < 0) {
      return '終了日は開始日以降を選択してください。';
    }
    if (isPastTournament(endDate, now: now)) {
      return '過去大会は登録できません。';
    }
    return null;
  }
}


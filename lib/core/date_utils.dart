import 'package:intl/intl.dart';

final DateFormat _ymdFormat = DateFormat('yyyy-MM-dd');

DateTime nowJst() {
  return DateTime.now().toUtc().add(const Duration(hours: 9));
}

String formatYmd(DateTime date) {
  return _ymdFormat.format(date);
}

DateTime parseJstYmd(String ymd) {
  return DateTime.parse('$ymd 00:00:00+09:00');
}

bool isPastTournament(String endDateYmd, {DateTime? now}) {
  final today = formatYmd(now ?? nowJst());
  return endDateYmd.compareTo(today) < 0;
}

bool isActiveTournament(
  String startDateYmd,
  String endDateYmd, {
  DateTime? now,
}) {
  final today = formatYmd(now ?? nowJst());
  return startDateYmd.compareTo(today) <= 0 &&
      endDateYmd.compareTo(today) >= 0;
}

bool isFutureTournament(String startDateYmd, {DateTime? now}) {
  final today = formatYmd(now ?? nowJst());
  return startDateYmd.compareTo(today) > 0;
}

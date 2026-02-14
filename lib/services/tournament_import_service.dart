import '../core/date_utils.dart';
import '../data/models/tournament.dart';
import '../data/models/tournament_chart.dart';
import '../domain/repositories/song_master_repository.dart';
import '../domain/repositories/tournament_repository.dart';
import 'qr_service.dart';

/// 大会取り込み処理の結果。
class TournamentImportResult {
  const TournamentImportResult._({
    required this.success,
    this.message,
  });

  final bool success;
  final String? message;

  const TournamentImportResult.success() : this._(success: true);

  const TournamentImportResult.failure(String message)
      : this._(success: false, message: message);
}

/// QR/共有画像から受け取った大会データを検証してDBへ登録するサービス。
class TournamentImportService {
  TournamentImportService({
    required QrService qrService,
    required TournamentRepositoryContract tournamentRepository,
    required SongMasterRepositoryContract songMasterRepository,
    required DateTime Function() nowJst,
    required void Function() onChanged,
  })  : _qrService = qrService,
        _tournamentRepository = tournamentRepository,
        _songMasterRepository = songMasterRepository,
        _nowJst = nowJst,
        _onChanged = onChanged;

  final QrService _qrService;
  final TournamentRepositoryContract _tournamentRepository;
  final SongMasterRepositoryContract _songMasterRepository;
  final DateTime Function() _nowJst;
  final void Function() _onChanged;

  static const _msgDecodeFailed = '\u0051\u0052\u306e\u8aad\u307f\u53d6\u308a\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002';
  static const _msgInvalidPayload = '\u0051\u0052\u306e\u5185\u5bb9\u304c\u4e0d\u6b63\u3067\u3059\u3002';
  static const _msgAlreadyExists =
      '\u540c\u3058\u5927\u4f1a\u304c\u65e2\u306b\u767b\u9332\u3055\u308c\u3066\u3044\u307e\u3059\u3002';
  static const _msgPastTournament =
      '\u904e\u53bb\u5927\u4f1a\u306f\u8ffd\u52a0\u3067\u304d\u307e\u305b\u3093\u3002';
  static const _msgChartNotFound =
      '\u66f2\u30de\u30b9\u30bf\u306b\u5b58\u5728\u3057\u306a\u3044\u8b5c\u9762\u304c\u542b\u307e\u308c\u3066\u3044\u307e\u3059\u3002';
  static const _msgNoChartData = '\u8b5c\u9762\u60c5\u5831\u304c\u3042\u308a\u307e\u305b\u3093\u3002';

  /// QR文字列を復号し、共通取り込み処理へ渡す。
  Future<TournamentImportResult> importFromQrRawValue(String rawValue) async {
    try {
      final payload = _qrService.decodeTournament(rawValue);
      return importFromPayload(payload);
    } on QrDecodeException {
      return const TournamentImportResult.failure(_msgDecodeFailed);
    } on QrTooLargeException {
      return const TournamentImportResult.failure(_msgDecodeFailed);
    }
  }

  /// 取り込みペイロードを検証し、大会・譜面を登録する。
  Future<TournamentImportResult> importFromPayload(
    Map<String, dynamic> payload,
  ) async {
    final uuid = payload['tournament_uuid'] as String?;
    if (uuid == null || uuid.isEmpty) {
      return const TournamentImportResult.failure(_msgInvalidPayload);
    }

    if (await _tournamentRepository.exists(uuid)) {
      return const TournamentImportResult.failure(_msgAlreadyExists);
    }

    final endDate = payload['end_date'] as String?;
    if (endDate == null || isPastTournament(endDate, now: _nowJst())) {
      return const TournamentImportResult.failure(_msgPastTournament);
    }

    final charts = payload['charts'];
    if (charts is! List) {
      return const TournamentImportResult.failure(_msgInvalidPayload);
    }

    final chartModels = <TournamentChart>[];
    for (final item in charts) {
      if (item is! Map<String, dynamic>) continue;
      final chartId = item['chart_id'] as int?;
      final sortOrder = item['sort_order'] as int?;
      if (chartId == null || sortOrder == null) continue;

      final chart = await _songMasterRepository.fetchChartById(chartId);
      if (chart == null) {
        return const TournamentImportResult.failure(_msgChartNotFound);
      }

      chartModels.add(
        TournamentChart(
          tournamentChartId: null,
          tournamentUuid: uuid,
          chartId: chartId,
          sortOrder: sortOrder,
          createdAt: _nowJst().toIso8601String(),
        ),
      );
    }

    if (chartModels.isEmpty) {
      return const TournamentImportResult.failure(_msgNoChartData);
    }

    final nowIso = _nowJst().toIso8601String();
    final createdAt = payload['created_at'] as String? ?? nowIso;
    final tournament = Tournament(
      tournamentUuid: uuid,
      tournamentName: payload['tournament_name'] as String? ?? '',
      owner: payload['owner'] as String? ?? '',
      hashtag: payload['hashtag'] as String? ?? '',
      startDate: payload['start_date'] as String? ?? '',
      endDate: payload['end_date'] as String? ?? '',
      isImported: true,
      backgroundImagePath: null,
      createdAt: createdAt,
      updatedAt: createdAt,
    );

    await _tournamentRepository.createTournament(tournament, chartModels);
    _onChanged();
    return const TournamentImportResult.success();
  }
}

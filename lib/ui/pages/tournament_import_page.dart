import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../app_services.dart';
import '../../core/date_utils.dart';
import '../../data/models/tournament.dart';
import '../../data/models/tournament_chart.dart';
import '../../services/qr_service.dart';

class TournamentImportPage extends StatefulWidget {
  const TournamentImportPage({super.key});

  static const String routeName = '/tournaments/import';

  @override
  State<TournamentImportPage> createState() => _TournamentImportPageState();
}

class _TournamentImportPageState extends State<TournamentImportPage> {
  final _services = AppServices.instance;
  bool _processing = false;

  Future<void> _handleBarcode(BarcodeCapture capture) async {
    if (_processing) return;
    final barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;
    final raw = barcodes.first.rawValue;
    if (raw == null || raw.isEmpty) return;
    setState(() => _processing = true);
    try {
      final payload = _services.qrService.decodeTournament(raw);
      await _import(payload);
    } on QrDecodeException {
      await _showError('QRの読み取りに失敗しました。');
    } on QrTooLargeException {
      await _showError('QRの読み取りに失敗しました。');
    } finally {
      if (mounted) {
        setState(() => _processing = false);
      }
    }
  }

  Future<void> _import(Map<String, dynamic> payload) async {
    final uuid = payload['tournament_uuid'] as String?;
    if (uuid == null || uuid.isEmpty) {
      await _showError('QRの内容が不正です。');
      return;
    }
    if (await _services.tournamentRepo.exists(uuid)) {
      await _showError('同じ大会が既に存在します。');
      return;
    }
    final endDate = payload['end_date'] as String?;
    if (endDate == null || isPastTournament(endDate)) {
      await _showError('過去大会は登録できません。');
      return;
    }

    final charts = payload['charts'];
    if (charts is! List) {
      await _showError('QRの内容が不正です。');
      return;
    }

    final chartModels = <TournamentChart>[];
    for (final item in charts) {
      if (item is! Map<String, dynamic>) continue;
      final chartId = item['chart_id'] as int?;
      final sortOrder = item['sort_order'] as int?;
      if (chartId == null || sortOrder == null) continue;
      final chart = await _services.songMasterRepo.fetchChartById(chartId);
      if (chart == null) {
        await _showError('曲マスタに存在しない譜面が含まれています。');
        return;
      }
      chartModels.add(
        TournamentChart(
          tournamentChartId: null,
          tournamentUuid: uuid,
          chartId: chartId,
          sortOrder: sortOrder,
          createdAt: nowJst().toIso8601String(),
        ),
      );
    }
    if (chartModels.isEmpty) {
      await _showError('譜面情報がありません。');
      return;
    }

    final tournament = Tournament(
      tournamentUuid: uuid,
      tournamentName: payload['tournament_name'] as String? ?? '',
      owner: payload['owner'] as String? ?? '',
      hashtag: payload['hashtag'] as String? ?? '',
      startDate: payload['start_date'] as String? ?? '',
      endDate: payload['end_date'] as String? ?? '',
      backgroundImagePath: null,
      createdAt: payload['created_at'] as String? ?? nowJst().toIso8601String(),
      updatedAt: payload['created_at'] as String? ?? nowJst().toIso8601String(),
    );

    await _services.tournamentRepo.createTournament(tournament, chartModels);
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  Future<void> _showError(String message) async {
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('エラー'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('QR取込')),
      body: Stack(
        children: [
          MobileScanner(onDetect: _handleBarcode),
          if (_processing)
            const Center(child: CircularProgressIndicator()),
        ],
      ),
    );
  }
}

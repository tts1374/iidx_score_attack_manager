import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../app_services.dart';
import '../../core/date_utils.dart';
import '../../data/models/tournament.dart';
import '../../data/models/song_master.dart';
import '../../services/post_image_service.dart';
import '../../services/qr_service.dart';

class PostSupportPage extends StatefulWidget {
  const PostSupportPage({super.key});

  static const String routeName = '/post-support';

  @override
  State<PostSupportPage> createState() => _PostSupportPageState();
}

class _PostSupportPageState extends State<PostSupportPage> {
  final _services = AppServices.instance;
  final _postImageService = PostImageService();
  Uint8List? _preview;
  bool _generating = false;
  late Future<_PostSupportView> _view;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final uuid = ModalRoute.of(context)!.settings.arguments as String;
    _view = _load(uuid);
  }

  Future<_PostSupportView> _load(String uuid) async {
    final tournament = await _services.tournamentRepo.fetchByUuid(uuid);
    if (tournament == null) {
      throw StateError('Tournament not found');
    }
    ui.Image? background;
    if (tournament.backgroundImagePath != null) {
      final file = File(tournament.backgroundImagePath!);
      if (file.existsSync()) {
        final bytes = await file.readAsBytes();
        background = await _decodeImage(bytes);
      }
    }
    final charts = await _services.tournamentRepo.fetchCharts(uuid);
    final details = <_ChartDetail>[];
    for (final chart in charts) {
      final chartInfo =
          await _services.songMasterRepo.fetchChartById(chart.chartId);
      SongMasterMusic? music;
      if (chartInfo != null) {
        music = await _services.songMasterRepo.fetchMusicById(chartInfo.musicId);
      }
      details.add(_ChartDetail(
        chart: chartInfo,
        music: music,
        sortOrder: chart.sortOrder,
      ));
    }
    return _PostSupportView(tournament, details, background);
  }

  Future<void> _generate(_PostSupportView view) async {
    if (_generating) return;
    setState(() => _generating = true);
    try {
      final qrData = _services.qrService.encodeTournament({
        'tournament_uuid': view.tournament.tournamentUuid,
        'tournament_name': view.tournament.tournamentName,
        'owner': view.tournament.owner,
        'hashtag': view.tournament.hashtag,
        'start_date': view.tournament.startDate,
        'end_date': view.tournament.endDate,
        'created_at': view.tournament.createdAt,
        'charts': view.charts
            .map((detail) => {
                  'music_id': detail.chart?.musicId ?? 0,
                  'chart_id': detail.chart?.chartId ?? 0,
                  'sort_order': detail.sortOrder,
                })
            .toList(),
      });
      final data = PostImageData(
        qrData: qrData,
        title: view.tournament.tournamentName,
        period: '${view.tournament.startDate}〜${view.tournament.endDate}',
        hashtag: view.tournament.hashtag,
        charts: view.charts
            .map(
              (detail) => PostChartLine(
                version: detail.music?.version ?? '',
                title: detail.music?.title ?? '不明な曲',
                playStyle: detail.chart?.playStyle ?? '',
                difficulty: detail.chart?.difficulty ?? '',
                level: detail.chart?.level ?? 0,
              ),
            )
            .toList(),
        background: view.background,
      );
      final imageBytes = await _postImageService.generate(data);
      setState(() => _preview = imageBytes);
    } on QrTooLargeException {
      await _showMessage('QRコードが作成できませんでした');
    } finally {
      if (mounted) {
        setState(() => _generating = false);
      }
    }
  }

  Future<void> _showMessage(String message) async {
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('確認'),
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

  Future<ui.Image> _decodeImage(Uint8List bytes) async {
    final completer = Completer<ui.Image>();
    ui.decodeImageFromList(bytes, completer.complete);
    return completer.future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('投稿支援')),
      body: FutureBuilder<_PostSupportView>(
        future: _view,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(child: Text('読み込みに失敗しました。'));
          }
          final view = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(view.tournament.tournamentName,
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text('${view.tournament.startDate}〜${view.tournament.endDate}'),
              const SizedBox(height: 8),
              Text(view.tournament.hashtag),
              const SizedBox(height: 16),
              Row(
                children: [
                  FilledButton(
                    onPressed: _generating ? null : () => _generate(view),
                    child: _generating
                        ? const CircularProgressIndicator()
                        : const Text('投稿画像生成'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_preview != null)
                Image.memory(_preview!)
              else
                const Text('生成結果がここに表示されます。'),
              const SizedBox(height: 16),
              Text(
                isActiveTournament(view.tournament.startDate, view.tournament.endDate)
                    ? '開催中'
                    : isFutureTournament(view.tournament.startDate)
                        ? '未来'
                        : '終了',
              ),
            ],
          );
        },
      ),
    );
  }
}

class _PostSupportView {
  _PostSupportView(this.tournament, this.charts, this.background);

  final Tournament tournament;
  final List<_ChartDetail> charts;
  final ui.Image? background;
}

class _ChartDetail {
  _ChartDetail({
    required this.chart,
    required this.music,
    required this.sortOrder,
  });

  final SongMasterChart? chart;
  final SongMasterMusic? music;
  final int sortOrder;
}

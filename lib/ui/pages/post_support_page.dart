import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/date_utils.dart';
import '../../data/models/song_master.dart';
import '../../data/models/tournament.dart';
import '../../providers/data_source_providers.dart';
import '../../providers/use_case_providers.dart';
import '../../services/post_image_service.dart';
import '../../services/qr_service.dart';

class PostSupportPage extends ConsumerStatefulWidget {
  const PostSupportPage({super.key});

  static const String routeName = '/post-support';

  @override
  ConsumerState<PostSupportPage> createState() => _PostSupportPageState();
}

class _PostSupportPageState extends ConsumerState<PostSupportPage> {
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
    final tournamentUseCase = ref.read(tournamentUseCaseProvider);
    final songMasterUseCase = ref.read(songMasterUseCaseProvider);
    final tournament = await tournamentUseCase.fetchByUuid(uuid);
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
    final charts = await tournamentUseCase.fetchCharts(uuid);
    final details = <_ChartDetail>[];
    for (final chart in charts) {
      final chartInfo = await songMasterUseCase.fetchChartById(chart.chartId);
      SongMasterMusic? music;
      if (chartInfo != null) {
        music = await songMasterUseCase.fetchMusicById(chartInfo.musicId);
      }
      details.add(
        _ChartDetail(
          chart: chartInfo,
          music: music,
          sortOrder: chart.sortOrder,
        ),
      );
    }
    return _PostSupportView(tournament, details, background);
  }

  Future<void> _generate(_PostSupportView view) async {
    if (_generating) return;
    setState(() => _generating = true);
    try {
      final qrData = ref.read(qrServiceDataSourceProvider).encodeTournament({
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
        period: '${view.tournament.startDate}\u301c${view.tournament.endDate}',
        hashtag: view.tournament.hashtag,
        charts: view.charts
            .map(
              (detail) => PostChartLine(
                version: detail.music?.version ?? '',
                title: detail.music?.title ?? '\u4e0d\u660e\u306a\u66f2',
                playStyle: detail.chart?.playStyle ?? '',
                difficulty: detail.chart?.difficulty ?? '',
                level: detail.chart?.level ?? 0,
              ),
            )
            .toList(),
        background: view.background,
      );
      final imageBytes = await ref.read(postImageDataSourceProvider).generate(data);
      setState(() => _preview = imageBytes);
    } on QrTooLargeException {
      await _showMessage(
        '\u0051\u0052\u30b3\u30fc\u30c9\u304c\u4f5c\u6210\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f',
      );
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
        title: const Text('\u901a\u77e5'),
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
      appBar: AppBar(title: const Text('\u6295\u7a3f\u652f\u63f4')),
      body: FutureBuilder<_PostSupportView>(
        future: _view,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(
              child: Text('\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002'),
            );
          }
          final view = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                view.tournament.tournamentName,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text('${view.tournament.startDate}\u301c${view.tournament.endDate}'),
              const SizedBox(height: 8),
              Text(view.tournament.hashtag),
              const SizedBox(height: 16),
              Row(
                children: [
                  FilledButton(
                    onPressed: _generating ? null : () => _generate(view),
                    child: _generating
                        ? const CircularProgressIndicator()
                        : const Text('\u6295\u7a3f\u753b\u50cf\u751f\u6210'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_preview != null)
                Image.memory(_preview!)
              else
                const Text('\u751f\u6210\u3055\u308c\u305f\u753b\u50cf\u304c\u3053\u3053\u306b\u8868\u793a\u3055\u308c\u307e\u3059\u3002'),
              const SizedBox(height: 16),
              Text(
                isActiveTournament(view.tournament.startDate, view.tournament.endDate)
                    ? '\u958b\u50ac\u4e2d'
                    : isFutureTournament(view.tournament.startDate)
                        ? '\u672a\u958b\u50ac'
                        : '\u7d42\u4e86',
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

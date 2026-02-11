import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../app_services.dart';
import '../../core/date_utils.dart';
import '../../core/difficulty_color.dart';
import '../../data/models/evidence.dart';
import '../../data/models/song_master.dart';
import '../../data/models/tournament.dart';
import '../../data/models/tournament_chart.dart';
import '../../services/post_image_service.dart';
import 'evidence_register_page.dart';
import 'tournament_update_page.dart';

class TournamentDetailPage extends StatefulWidget {
  const TournamentDetailPage({super.key});

  static const String routeName = '/tournaments/detail';

  @override
  State<TournamentDetailPage> createState() => _TournamentDetailPageState();
}

class _TournamentDetailPageState extends State<TournamentDetailPage> {
  final _services = AppServices.instance;
  final _postImageService = PostImageService();
  late Future<TournamentDetailView> _detail;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final uuid = ModalRoute.of(context)!.settings.arguments as String;
    _detail = _load(uuid);
  }

  Future<TournamentDetailView> _load(String uuid) async {
    final tournament = await _services.tournamentRepo.fetchByUuid(uuid);
    if (tournament == null) {
      throw StateError('Tournament not found');
    }

    final charts = await _services.tournamentRepo.fetchCharts(uuid);
    final evidences = await _services.evidenceRepo.fetchEvidencesByTournament(
      uuid,
    );
    final evidenceMap = {
      for (final evidence in evidences) evidence.chartId: evidence,
    };

    final items = <TournamentChartView>[];
    for (final chart in charts) {
      final chartInfo = await _services.songMasterRepo.fetchChartById(
        chart.chartId,
      );
      SongMasterMusic? music;
      if (chartInfo != null) {
        music = await _services.songMasterRepo.fetchMusicById(chartInfo.musicId);
      }
      items.add(
        TournamentChartView(
          chart: chart,
          chartInfo: chartInfo,
          music: music,
          evidence: evidenceMap[chart.chartId],
        ),
      );
    }

    return TournamentDetailView(tournament, items);
  }

  Future<void> _deleteTournament(String uuid) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('削除確認'),
        content: const Text('大会を削除しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('削除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final evidences = await _services.evidenceRepo.fetchEvidencesByTournament(
      uuid,
    );
    for (final evidence in evidences) {
      await _services.evidenceService.deleteEvidence(evidence);
    }

    final tournament = await _services.tournamentRepo.fetchByUuid(uuid);
    final backgroundPath = tournament?.backgroundImagePath;
    if (backgroundPath != null) {
      final file = File(backgroundPath);
      if (file.existsSync()) {
        await file.delete();
      }
    }

    await _services.tournamentRepo.deleteTournament(uuid);
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  Future<File> _buildTournamentPostImage(TournamentDetailView detail) async {
    final charts = detail.charts
        .map(
          (item) => PostChartLine(
            version: item.music?.version ?? '',
            title: item.music?.title ?? '不明な曲',
            playStyle: item.chartInfo?.playStyle ?? '',
            difficulty: item.chartInfo?.difficulty ?? '',
            level: item.chartInfo?.level ?? 0,
          ),
        )
        .toList();

    final qrData = _services.qrService.encodeTournament({
      'tournament_uuid': detail.tournament.tournamentUuid,
      'tournament_name': detail.tournament.tournamentName,
      'owner': detail.tournament.owner,
      'hashtag': detail.tournament.hashtag,
      'start_date': detail.tournament.startDate,
      'end_date': detail.tournament.endDate,
      'created_at': detail.tournament.createdAt,
      'charts': detail.charts
          .map(
            (item) => {
              'music_id': item.chartInfo?.musicId ?? 0,
              'chart_id': item.chart.chartId,
              'sort_order': item.chart.sortOrder,
            },
          )
          .toList(),
    });

    final postData = PostImageData(
      qrData: qrData,
      title: detail.tournament.tournamentName,
      period: '${detail.tournament.startDate}～${detail.tournament.endDate}',
      hashtag: detail.tournament.hashtag,
      charts: charts,
      background: await _loadBackgroundImage(detail.tournament.backgroundImagePath),
    );

    final bytes = await _postImageService.generate(postData);
    final tempDir = await getTemporaryDirectory();
    final path = p.join(tempDir.path, '${detail.tournament.tournamentUuid}_post.png');
    final file = File(path);
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<ui.Image?> _loadBackgroundImage(String? path) async {
    if (path == null) return null;
    final file = File(path);
    if (!file.existsSync()) return null;
    final bytes = await file.readAsBytes();
    final completer = Completer<ui.Image>();
    ui.decodeImageFromList(bytes, completer.complete);
    return completer.future;
  }

  Future<void> _openTournamentPostModal(TournamentDetailView detail) async {
    await showDialog<void>(
      context: context,
      builder: (_) {
        return _TournamentPostDialog(
          title: detail.tournament.tournamentName,
          imageFuture: _buildTournamentPostImage(detail),
          hashtag: detail.tournament.hashtag,
        );
      },
    );
  }

  List<Evidence> _pendingUpdateEvidences(TournamentDetailView detail) {
    final list = <Evidence>[];
    for (final item in detail.charts) {
      final evidence = item.evidence;
      if (evidence != null && evidence.postedFlagUpdate == 0) {
        list.add(evidence);
      }
    }
    return list;
  }

  Future<void> _shareUpdates(TournamentDetailView detail) async {
    final pending = _pendingUpdateEvidences(detail);
    if (pending.isEmpty) {
      return;
    }

    final files = <XFile>[];
    for (final evidence in pending) {
      final file = File(evidence.filePath);
      if (file.existsSync()) {
        files.add(XFile(file.path));
      }
    }
    if (files.isEmpty) {
      return;
    }

    await Share.shareXFiles(
      files,
      text: '#${detail.tournament.hashtag}',
      subject: '投稿先を選択',
    );

    final postedAt = nowJst().toIso8601String();
    for (final evidence in pending) {
      if (evidence.evidenceId != null) {
        await _services.evidenceRepo.markUpdatePosted(
          evidenceId: evidence.evidenceId!,
          postedAt: postedAt,
        );
      }
    }

    if (!mounted) return;
    setState(() {
      _detail = _load(detail.tournament.tournamentUuid);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('大会詳細')),
      body: FutureBuilder<TournamentDetailView>(
        future: _detail,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(child: Text('読み込みに失敗しました。'));
          }

          final detail = snapshot.data!;
          final canPost = _pendingUpdateEvidences(detail).isNotEmpty;
          final isOngoing = isActiveTournament(
            detail.tournament.startDate,
            detail.tournament.endDate,
          );
          final isUpcoming = isFutureTournament(detail.tournament.startDate);
          final today = parseJstYmd(formatYmd(nowJst()));
          final endDate = parseJstYmd(detail.tournament.endDate);
          final startDate = parseJstYmd(detail.tournament.startDate);
          final remainingDays = endDate.difference(today).inDays;
          final daysUntilStart = startDate.difference(today).inDays;
          final deadlineTone = _DetailDeadlineTone.fromRemainingDays(remainingDays);
          final totalCharts = detail.charts.length.clamp(0, 4);
          final submittedCount = totalCharts == 0
              ? 0
              : detail.charts.where((item) => item.evidence != null).length.clamp(
                    0,
                    totalCharts,
                  );
          final progress = totalCharts == 0 ? 0.0 : submittedCount / totalCharts;
          final hasPending = totalCharts > 0 && submittedCount < totalCharts;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                elevation: 0,
                color: const Color(0xFFFCFCFD),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: Colors.grey.shade200),
                ),
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border(
                      left: isOngoing
                          ? BorderSide(width: 4, color: deadlineTone.accentColor)
                          : BorderSide.none,
                    ),
                  ),
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(isOngoing ? 10 : 16, 16, 16, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Text(
                                detail.tournament.tournamentName,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                      fontWeight: FontWeight.w700,
                                    ),
                              ),
                            ),
                            if (isOngoing) ...[
                              const SizedBox(width: 8),
                              _DetailDeadlineBadge(
                                label: remainingDays == 0
                                    ? '本日まで'
                                    : '残り$remainingDays日',
                                tone: deadlineTone,
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                detail.tournament.owner,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Colors.grey.shade600,
                                    ),
                              ),
                            ),
                            _DetailStatusChip(
                              isOngoing: isOngoing,
                              isUpcoming: isUpcoming,
                              daysUntilStart: daysUntilStart,
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${detail.tournament.startDate}〜${detail.tournament.endDate}',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Colors.grey.shade700,
                              ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Text(
                              '提出: $submittedCount/$totalCharts',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: Colors.grey.shade800,
                                    fontWeight: FontWeight.w600,
                                  ),
                            ),
                            const SizedBox(width: 8),
                            SizedBox(
                              width: 88,
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(999),
                                child: LinearProgressIndicator(
                                  minHeight: 6,
                                  value: progress,
                                  backgroundColor: Colors.grey.shade200,
                                  valueColor: const AlwaysStoppedAnimation<Color>(
                                    Color(0xFF527EC7),
                                  ),
                                ),
                              ),
                            ),
                            const Spacer(),
                            if (hasPending)
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: Color(0xFFF59E0B),
                                  shape: BoxShape.circle,
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            FilledButton(
                              style: FilledButton.styleFrom(
                                backgroundColor: const Color(0xFFE2E8F0),
                                foregroundColor: const Color(0xFF334155),
                              ),
                              onPressed: () => _openTournamentPostModal(detail),
                              child: const Text('大会画像作成'),
                            ),
                            const Spacer(),
                            IconButton.filled(
                              style: IconButton.styleFrom(
                                backgroundColor: const Color(0xFFE2E8F0),
                                foregroundColor: const Color(0xFF334155),
                              ),
                              tooltip: '更新',
                              onPressed: () async {
                                final result = await Navigator.pushNamed(
                                  context,
                                  TournamentUpdatePage.routeName,
                                  arguments: detail.tournament.tournamentUuid,
                                );
                                if (result == true) {
                                  setState(() {
                                    _detail = _load(detail.tournament.tournamentUuid);
                                  });
                                }
                              },
                              icon: const Icon(Icons.edit),
                            ),
                            const SizedBox(width: 8),
                            IconButton.filled(
                              style: IconButton.styleFrom(
                                backgroundColor: const Color(0xFFE2E8F0),
                                foregroundColor: const Color(0xFF334155),
                              ),
                              tooltip: '削除',
                              onPressed: () => _deleteTournament(
                                detail.tournament.tournamentUuid,
                              ),
                              icon: const Icon(Icons.delete),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                '譜面一覧',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Card(
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: Colors.grey.shade200),
                ),
                child: Column(
                  children: [
                    for (var i = 0; i < detail.charts.length; i++) ...[
                      _TournamentChartTile(
                        item: detail.charts[i],
                        onTap: () async {
                          final updated = await Navigator.pushNamed(
                            context,
                            EvidenceRegisterPage.routeName,
                            arguments: EvidenceRegisterArgs(
                              tournamentUuid: detail.tournament.tournamentUuid,
                              chartId: detail.charts[i].chart.chartId,
                            ),
                          );
                          if (updated == true) {
                            setState(() {
                              _detail = _load(detail.tournament.tournamentUuid);
                            });
                          }
                        },
                      ),
                      if (i != detail.charts.length - 1)
                        Divider(height: 1, color: Colors.grey.shade200),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF527EC7),
                ),
                onPressed: canPost ? () => _shareUpdates(detail) : null,
                child: const Text('投稿'),
              ),
              const SizedBox(height: 12),
            ],
          );
        },
      ),
    );
  }
}

class TournamentDetailView {
  TournamentDetailView(this.tournament, this.charts);

  final Tournament tournament;
  final List<TournamentChartView> charts;
}

class TournamentChartView {
  TournamentChartView({
    required this.chart,
    required this.chartInfo,
    required this.music,
    required this.evidence,
  });

  final TournamentChart chart;
  final SongMasterChart? chartInfo;
  final SongMasterMusic? music;
  final Evidence? evidence;
}

class _DetailStatusChip extends StatelessWidget {
  const _DetailStatusChip({
    required this.isOngoing,
    required this.isUpcoming,
    required this.daysUntilStart,
  });

  final bool isOngoing;
  final bool isUpcoming;
  final int daysUntilStart;

  @override
  Widget build(BuildContext context) {
    late final String label;
    late final Color bg;
    late final Color fg;
    if (isOngoing) {
      label = '開催中';
      bg = const Color(0xFFDCEAFE);
      fg = const Color(0xFF1D4ED8);
    } else if (isUpcoming) {
      final safeDays = daysUntilStart.clamp(0, 9999);
      label = 'あと$safeDays日';
      bg = const Color(0xFFE5E7EB);
      fg = const Color(0xFF374151);
    } else {
      label = '終了';
      bg = const Color(0xFFF3F4F6);
      fg = const Color(0xFF6B7280);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _DetailDeadlineBadge extends StatelessWidget {
  const _DetailDeadlineBadge({
    required this.label,
    required this.tone,
  });

  final String label;
  final _DetailDeadlineTone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: tone.backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: tone.textColor,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _DetailDeadlineTone {
  const _DetailDeadlineTone({
    required this.accentColor,
    required this.backgroundColor,
    required this.textColor,
  });

  final Color accentColor;
  final Color backgroundColor;
  final Color textColor;

  static _DetailDeadlineTone fromRemainingDays(int remainingDays) {
    if (remainingDays <= 0) {
      return const _DetailDeadlineTone(
        accentColor: Color(0xFFEF4444),
        backgroundColor: Color(0xFFFEE2E2),
        textColor: Color(0xFFB91C1C),
      );
    }
    if (remainingDays <= 3) {
      return const _DetailDeadlineTone(
        accentColor: Color(0xFFF59E0B),
        backgroundColor: Color(0xFFFEF3C7),
        textColor: Color(0xFF92400E),
      );
    }
    if (remainingDays <= 7) {
      return const _DetailDeadlineTone(
        accentColor: Color(0xFF3B82F6),
        backgroundColor: Color(0xFFDBEAFE),
        textColor: Color(0xFF1D4ED8),
      );
    }
    return const _DetailDeadlineTone(
      accentColor: Color(0xFF94A3B8),
      backgroundColor: Color(0xFFE5E7EB),
      textColor: Color(0xFF475569),
    );
  }
}

class _TournamentPostDialog extends StatelessWidget {
  const _TournamentPostDialog({
    required this.title,
    required this.imageFuture,
    required this.hashtag,
  });

  final String title;
  final Future<File> imageFuture;
  final String hashtag;

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    return Dialog(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FutureBuilder<File>(
          future: imageFuture,
          builder: (context, snapshot) {
            final imageReady =
                snapshot.connectionState == ConnectionState.done &&
                snapshot.hasData;
            return ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: screenHeight * 0.65,
                maxHeight: screenHeight * 0.9,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: SizedBox(
                      width: double.infinity,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: snapshot.connectionState == ConnectionState.waiting
                            ? const Center(child: CircularProgressIndicator())
                            : snapshot.hasError
                                ? const Center(child: Text('画像生成に失敗しました。'))
                                : ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.file(
                                      snapshot.data!,
                                      fit: BoxFit.contain,
                                    ),
                                  ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('閉じる'),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: imageReady
                            ? () async {
                                final file = snapshot.data!;
                                await Share.shareXFiles(
                                  [XFile(file.path)],
                                  text: '#$hashtag',
                                  subject: '投稿先を選択',
                                );
                              }
                            : null,
                        child: const Text('共有'),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _TournamentChartTile extends StatelessWidget {
  const _TournamentChartTile({
    required this.item,
    required this.onTap,
  });

  final TournamentChartView item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hasEvidence = item.evidence != null;
    final isUpdated = hasEvidence && item.evidence!.postedFlagUpdate == 0;
    final statusLabel = hasEvidence ? '登録済' : '未登録';
    final dotColor = isUpdated ? Colors.red : Colors.grey;
    final playStyle = item.chartInfo?.playStyle ?? '';
    final difficulty = item.chartInfo?.difficulty ?? '';
    final level = item.chartInfo?.level ?? 0;
    final diffColor = difficultyColor(difficulty);

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: dotColor,
          shape: BoxShape.circle,
        ),
      ),
      title: Text(
        item.music?.title ?? '不明な曲',
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: RichText(
        text: TextSpan(
          style: Theme.of(context).textTheme.bodySmall,
          children: [
            TextSpan(
              text: '$playStyle $difficulty ',
              style: TextStyle(
                color: diffColor,
                fontWeight: FontWeight.w700,
              ),
            ),
            TextSpan(
              text: 'Lv$level',
              style: TextStyle(
                color: Colors.grey.shade700,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            statusLabel,
            style: TextStyle(color: Colors.grey.shade700),
          ),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right),
        ],
      ),
      onTap: onTap,
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app_services.dart';
import '../../core/date_utils.dart';
import '../../data/models/tournament.dart';
import '../../services/song_master_service.dart';
import 'settings_page.dart';
import 'tournament_create_page.dart';
import 'tournament_detail_page.dart';
import 'tournament_import_page.dart';

enum _TournamentTab { ongoing, upcoming, ended }

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  static const String routeName = '/';

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _services = AppServices.instance;
  late Future<List<_TournamentListItem>> _items;
  bool _checkedMaster = false;
  _TournamentTab _selectedTab = _TournamentTab.ongoing;

  @override
  void initState() {
    super.initState();
    _services.tournamentsChanged.addListener(_handleTournamentsChanged);
    _items = _load();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkSongMaster();
    });
  }

  @override
  void dispose() {
    _services.tournamentsChanged.removeListener(_handleTournamentsChanged);
    super.dispose();
  }

  void _handleTournamentsChanged() {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _refresh();
      }
    });
  }

  Future<void> _checkSongMaster() async {
    if (_checkedMaster) return;
    _checkedMaster = true;
    final result = await _services.songMasterService
        .checkAndUpdateIfNeeded()
        .timeout(
          const Duration(seconds: 15),
          onTimeout: () => const SongMasterUpdateResult(
            SongMasterUpdateStatus.upToDate,
          ),
        );
    if (!mounted) return;
    if (result.status == SongMasterUpdateStatus.failedInitial) {
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('エラー'),
          content: Text(result.message ?? '曲マスタの取得に失敗しました。'),
          actions: [
            TextButton(
              onPressed: () => SystemNavigator.pop(),
              child: const Text('終了'),
            ),
          ],
        ),
      );
      return;
    }
    if (result.status == SongMasterUpdateStatus.invalidSchema ||
        result.status == SongMasterUpdateStatus.unconfigured ||
        result.status == SongMasterUpdateStatus.missingAsset) {
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('曲マスタ更新'),
          content: Text(result.message ?? '曲マスタが利用できません。'),
          actions: [
            if (result.status == SongMasterUpdateStatus.invalidSchema)
              TextButton(
                onPressed: () async {
                  await _services.songMasterDb.reset();
                  if (mounted) Navigator.of(context).pop();
                },
                child: const Text('再取得'),
              ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }

  _TournamentTab _statusOf(Tournament tournament) {
    if (isActiveTournament(tournament.startDate, tournament.endDate)) {
      return _TournamentTab.ongoing;
    }
    if (isFutureTournament(tournament.startDate)) {
      return _TournamentTab.upcoming;
    }
    return _TournamentTab.ended;
  }

  Future<List<_TournamentListItem>> _load() async {
    final tournaments = await _services.tournamentRepo
        .fetchAll()
        .timeout(
          const Duration(seconds: 8),
          onTimeout: () => <Tournament>[],
        );

    if (tournaments.isEmpty) {
      return <_TournamentListItem>[];
    }

    Map<String, int> chartCounts = const {};
    Map<String, int> submittedCounts = const {};
    try {
      chartCounts = await _services.tournamentRepo
          .countChartsByTournament()
          .timeout(
            const Duration(seconds: 4),
            onTimeout: () => <String, int>{},
          );
    } catch (_) {}
    try {
      submittedCounts = await _services.evidenceRepo
          .countSubmittedByTournamentAll()
          .timeout(
            const Duration(seconds: 4),
            onTimeout: () => <String, int>{},
          );
    } catch (_) {}

    final items = <_TournamentListItem>[];
    for (final tournament in tournaments) {
      final chartCount = chartCounts[tournament.tournamentUuid] ?? 0;
      final submittedCount = submittedCounts[tournament.tournamentUuid] ?? 0;
      items.add(
        _TournamentListItem(
          tournament: tournament,
          chartCount: chartCount,
          submittedCount: submittedCount,
          status: _statusOf(tournament),
        ),
      );
    }
    return items;
  }

  Future<void> _refresh() async {
    setState(() {
      _items = _load();
    });
  }

  List<_TournamentListItem> _applyFilters(List<_TournamentListItem> items) {
    final filtered = items.where((item) => item.status == _selectedTab).toList();
    filtered.sort((a, b) {
      switch (_selectedTab) {
        case _TournamentTab.ongoing:
          return a.tournament.endDate.compareTo(b.tournament.endDate);
        case _TournamentTab.upcoming:
          return a.tournament.startDate.compareTo(b.tournament.startDate);
        case _TournamentTab.ended:
          return b.tournament.endDate.compareTo(a.tournament.endDate);
      }
    });
    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('大会一覧'),
        actions: [
          IconButton(
            onPressed: () => Navigator.pushNamed(
              context,
              SettingsPage.routeName,
            ),
            icon: const Icon(Icons.settings),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: _FilterRow(
              selectedTab: _selectedTab,
              onChanged: (tab) {
                setState(() {
                  _selectedTab = tab;
                });
              },
            ),
          ),
          Expanded(
            child: FutureBuilder<List<_TournamentListItem>>(
              future: _items,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return const Center(child: Text('読み込みに失敗しました。'));
                }
                final items = _applyFilters(snapshot.data ?? []);
                if (items.isEmpty) {
                  return const Center(child: Text('表示できる大会がありません。'));
                }
                return RefreshIndicator(
                  onRefresh: _refresh,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _TournamentCard(
                          item: item,
                          onTap: () async {
                            final result = await Navigator.pushNamed(
                              context,
                              TournamentDetailPage.routeName,
                              arguments: item.tournament.tournamentUuid,
                            );
                            if (result == true) {
                              _refresh();
                            }
                          },
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: _buildFab(context),
    );
  }

  Widget _buildFab(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        FloatingActionButton.extended(
          heroTag: 'import',
          onPressed: () async {
            final result = await Navigator.pushNamed(
              context,
              TournamentImportPage.routeName,
            );
            if (result == true) {
              _refresh();
            }
          },
          label: const Text('QR取込'),
          icon: const Icon(Icons.qr_code_scanner),
        ),
        const SizedBox(height: 12),
        FloatingActionButton.extended(
          heroTag: 'create',
          onPressed: () async {
            final result = await Navigator.pushNamed(
              context,
              TournamentCreatePage.routeName,
            );
            if (result == true) {
              _refresh();
            }
          },
          label: const Text('大会作成'),
          icon: const Icon(Icons.add),
        ),
      ],
    );
  }
}

class _TournamentListItem {
  const _TournamentListItem({
    required this.tournament,
    required this.chartCount,
    required this.submittedCount,
    required this.status,
  });

  final Tournament tournament;
  final int chartCount;
  final int submittedCount;
  final _TournamentTab status;
}

class _TournamentCard extends StatelessWidget {
  const _TournamentCard({
    required this.item,
    required this.onTap,
  });

  final _TournamentListItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tournament = item.tournament;
    final isOngoing = item.status == _TournamentTab.ongoing;
    final totalCharts = item.chartCount.clamp(0, 4);
    final submitted = totalCharts == 0
        ? 0
        : item.submittedCount.clamp(0, totalCharts);
    final progress = totalCharts == 0 ? 0.0 : submitted / totalCharts;
    final hasPending = totalCharts > 0 && submitted < totalCharts;

    final today = parseJstYmd(formatYmd(nowJst()));
    final remainingDays = parseJstYmd(tournament.endDate).difference(today).inDays;
    final daysUntilStart =
        parseJstYmd(tournament.startDate).difference(today).inDays;
    final deadlineTone = _DeadlineTone.fromRemainingDays(remainingDays);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Card(
        color: const Color(0xFFFCFCFD),
        elevation: 0,
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
            padding: EdgeInsets.fromLTRB(isOngoing ? 10 : 14, 12, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        tournament.tournamentName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                    ),
                    if (isOngoing) ...[
                      const SizedBox(width: 8),
                      _DeadlineBadge(
                        label: remainingDays == 0 ? '本日まで' : '残り$remainingDays日',
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
                        tournament.owner,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey.shade600,
                            ),
                      ),
                    ),
                    _StatusChip(
                      status: item.status,
                      daysUntilStart: item.status == _TournamentTab.upcoming
                          ? daysUntilStart
                          : null,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '${tournament.startDate}〜${tournament.endDate}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey.shade700,
                      ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      '提出: $submitted/$totalCharts',
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
                    const SizedBox(width: 8),
                    Icon(
                      Icons.chevron_right,
                      size: 18,
                      color: Colors.grey.shade500,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.selectedTab,
    required this.onChanged,
  });

  final _TournamentTab selectedTab;
  final ValueChanged<_TournamentTab> onChanged;

  @override
  Widget build(BuildContext context) {
    return ToggleButtons(
      isSelected: [
        selectedTab == _TournamentTab.ongoing,
        selectedTab == _TournamentTab.upcoming,
        selectedTab == _TournamentTab.ended,
      ],
      onPressed: (index) => onChanged(_TournamentTab.values[index]),
      borderRadius: BorderRadius.circular(8),
      children: const [
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Text('開催中'),
        ),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Text('開催前'),
        ),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Text('終了'),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.status,
    this.daysUntilStart,
  });

  final _TournamentTab status;
  final int? daysUntilStart;

  @override
  Widget build(BuildContext context) {
    late final String label;
    late final Color bg;
    late final Color fg;

    switch (status) {
      case _TournamentTab.ongoing:
        label = '開催中';
        bg = const Color(0xFFDCEAFE);
        fg = const Color(0xFF1D4ED8);
        break;
      case _TournamentTab.upcoming:
        final days = (daysUntilStart ?? 0).clamp(0, 9999);
        label = 'あと$days日';
        bg = const Color(0xFFE5E7EB);
        fg = const Color(0xFF374151);
        break;
      case _TournamentTab.ended:
        label = '終了';
        bg = const Color(0xFFF3F4F6);
        fg = const Color(0xFF6B7280);
        break;
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

class _DeadlineBadge extends StatelessWidget {
  const _DeadlineBadge({
    required this.label,
    required this.tone,
  });

  final String label;
  final _DeadlineTone tone;

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

class _DeadlineTone {
  const _DeadlineTone({
    required this.accentColor,
    required this.backgroundColor,
    required this.textColor,
  });

  final Color accentColor;
  final Color backgroundColor;
  final Color textColor;

  static _DeadlineTone fromRemainingDays(int remainingDays) {
    if (remainingDays <= 0) {
      return const _DeadlineTone(
        accentColor: Color(0xFFEF4444),
        backgroundColor: Color(0xFFFEE2E2),
        textColor: Color(0xFFB91C1C),
      );
    }
    if (remainingDays <= 3) {
      return const _DeadlineTone(
        accentColor: Color(0xFFF59E0B),
        backgroundColor: Color(0xFFFEF3C7),
        textColor: Color(0xFF92400E),
      );
    }
    if (remainingDays <= 7) {
      return const _DeadlineTone(
        accentColor: Color(0xFF3B82F6),
        backgroundColor: Color(0xFFDBEAFE),
        textColor: Color(0xFF1D4ED8),
      );
    }
    return const _DeadlineTone(
      accentColor: Color(0xFF94A3B8),
      backgroundColor: Color(0xFFE5E7EB),
      textColor: Color(0xFF475569),
    );
  }
}

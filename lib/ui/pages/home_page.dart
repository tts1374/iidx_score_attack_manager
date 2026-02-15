import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/date_utils.dart';
import '../../data/models/tournament.dart';
import '../../providers/data_source_providers.dart';
import '../../providers/system_providers.dart';
import '../../services/song_master_service.dart';
import '../../providers/use_case_providers.dart';
import 'settings_page.dart';
import 'tournament_create_page.dart';
import 'tournament_detail_page.dart';
import 'tournament_import_page.dart';

enum _TournamentTab { ongoing, upcoming, ended }

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  static const String routeName = '/';

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  static const _songMasterNotReadyMessage =
      '曲マスタが未登録です。初回起動時の曲マスタ取得が完了するまでしばらくお待ちください。';

  late Future<List<_TournamentListItem>> _items;
  bool _checkedMaster = false;
  _TournamentTab _selectedTab = _TournamentTab.ongoing;
  ProviderSubscription<int>? _tournamentsChangedSubscription;

  @override
  void initState() {
    super.initState();
    _items = _load();
    _tournamentsChangedSubscription = ref.listenManual<int>(
      tournamentsChangedProvider,
      (_, _) => _handleTournamentsChanged(),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkSongMaster();
    });
  }

  @override
  void dispose() {
    _tournamentsChangedSubscription?.close();
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
    final result = await ref
        .read(songMasterUseCaseProvider)
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
          title: const Text('\u30a8\u30e9\u30fc'),
          content: Text(
            result.message ?? '\u30de\u30b9\u30bf\u306e\u66f4\u65b0\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002',
          ),
          actions: [
            TextButton(
              onPressed: () => SystemNavigator.pop(),
              child: const Text('\u7d42\u4e86'),
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
          title: const Text('\u66f2\u30de\u30b9\u30bf\u66f4\u65b0'),
          content: Text(
            result.message ??
                '\u66f2\u30de\u30b9\u30bf\u3092\u5229\u7528\u3067\u304d\u307e\u305b\u3093\u3002',
          ),
          actions: [
            if (result.status == SongMasterUpdateStatus.invalidSchema)
              TextButton(
                onPressed: () async {
                  await ref.read(songMasterUseCaseProvider).resetDatabase();
                  if (mounted) Navigator.of(context).pop();
                },
                child: const Text('\u518d\u751f\u6210'),
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

  _TournamentTab _statusOf(Tournament tournament, DateTime now) {
    if (isActiveTournament(tournament.startDate, tournament.endDate, now: now)) {
      return _TournamentTab.ongoing;
    }
    if (isFutureTournament(tournament.startDate, now: now)) {
      return _TournamentTab.upcoming;
    }
    return _TournamentTab.ended;
  }

  Future<List<_TournamentListItem>> _load() async {
    final tournamentUseCase = ref.read(tournamentUseCaseProvider);
    final evidenceUseCase = ref.read(evidenceUseCaseProvider);
    final now = ref.read(nowJstProvider)();

    final tournaments = await tournamentUseCase.fetchAll().timeout(
          const Duration(seconds: 8),
          onTimeout: () => <Tournament>[],
        );

    if (tournaments.isEmpty) {
      return <_TournamentListItem>[];
    }

    Map<String, int> chartCounts = const {};
    Map<String, int> submittedCounts = const {};
    try {
      chartCounts = await tournamentUseCase.countChartsByTournament().timeout(
            const Duration(seconds: 4),
            onTimeout: () => <String, int>{},
          );
    } catch (_) {}
    try {
      submittedCounts = await evidenceUseCase.countSubmittedByTournamentAll().timeout(
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
          status: _statusOf(tournament, now),
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

  Future<void> _openTournamentCreatePage() async {
    final masterPath = await ref
        .read(songMasterDataSourceProvider)
        .existingPath()
        .timeout(
          const Duration(seconds: 5),
          onTimeout: () => null,
        );
    if (!mounted) return;
    if (masterPath == null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text(_songMasterNotReadyMessage)),
        );
      return;
    }
    final result = await Navigator.pushNamed(
      context,
      TournamentCreatePage.routeName,
    );
    if (result == true) {
      _refresh();
    }
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
        title: const Text('\u5927\u4f1a\u4e00\u89a7'),
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
                  return const Center(
                    child: Text('\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002'),
                  );
                }
                final items = _applyFilters(snapshot.data ?? []);
                final today = parseJstYmd(formatYmd(ref.read(nowJstProvider)()));
                if (items.isEmpty) {
                  return const Center(
                    child: Text('\u8868\u793a\u3067\u304d\u308b\u5927\u4f1a\u304c\u3042\u308a\u307e\u305b\u3093\u3002'),
                  );
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
                          today: today,
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
          label: const Text('\u0051\u0052\u53d6\u8fbc'),
          icon: const Icon(Icons.qr_code_scanner),
        ),
        const SizedBox(height: 12),
        FloatingActionButton.extended(
          heroTag: 'create',
          onPressed: _openTournamentCreatePage,
          label: const Text('\u5927\u4f1a\u4f5c\u6210'),
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
    required this.today,
    required this.onTap,
  });

  final _TournamentListItem item;
  final DateTime today;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tournament = item.tournament;
    final isOngoing = item.status == _TournamentTab.ongoing;
    final totalCharts = item.chartCount.clamp(0, 4);
    final submitted = totalCharts == 0 ? 0 : item.submittedCount.clamp(0, totalCharts);
    final progress = totalCharts == 0 ? 0.0 : submitted / totalCharts;
    final hasPending = totalCharts > 0 && submitted < totalCharts;

    final remainingDays = parseJstYmd(tournament.endDate).difference(today).inDays;
    final daysUntilStart = parseJstYmd(tournament.startDate).difference(today).inDays;
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
                        label: remainingDays == 0
                            ? '\u672c\u65e5\u307e\u3067'
                            : '\u6b8b\u308a$remainingDays\u65e5',
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
                  '${tournament.startDate}\u301c${tournament.endDate}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey.shade700,
                      ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      '\u63d0\u51fa: $submitted/$totalCharts',
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
          child: Text('\u958b\u50ac\u4e2d'),
        ),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Text('\u958b\u50ac\u524d'),
        ),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Text('\u7d42\u4e86'),
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
        label = '\u958b\u50ac\u4e2d';
        bg = const Color(0xFFDCEAFE);
        fg = const Color(0xFF1D4ED8);
        break;
      case _TournamentTab.upcoming:
        final days = (daysUntilStart ?? 0).clamp(0, 9999);
        label = '\u3042\u3068$days\u65e5';
        bg = const Color(0xFFE5E7EB);
        fg = const Color(0xFF374151);
        break;
      case _TournamentTab.ended:
        label = '\u7d42\u4e86';
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

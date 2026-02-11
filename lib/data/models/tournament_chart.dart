class TournamentChart {
  TournamentChart({
    required this.tournamentChartId,
    required this.tournamentUuid,
    required this.chartId,
    required this.sortOrder,
    required this.createdAt,
  });

  final int? tournamentChartId;
  final String tournamentUuid;
  final int chartId;
  final int sortOrder;
  final String createdAt;

  Map<String, Object?> toMap() {
    return {
      'tournament_chart_id': tournamentChartId,
      'tournament_uuid': tournamentUuid,
      'chart_id': chartId,
      'sort_order': sortOrder,
      'created_at': createdAt,
    };
  }

  factory TournamentChart.fromMap(Map<String, Object?> map) {
    return TournamentChart(
      tournamentChartId: map['tournament_chart_id'] as int?,
      tournamentUuid: map['tournament_uuid'] as String,
      chartId: map['chart_id'] as int,
      sortOrder: map['sort_order'] as int,
      createdAt: map['created_at'] as String,
    );
  }
}

interface ChartLabelInput {
  playStyle: string;
  difficulty: string;
  level: string;
}

export function formatChartLabel(chart: ChartLabelInput): string {
  const playStyle = String(chart.playStyle ?? '').trim();
  const difficulty = String(chart.difficulty ?? '').trim();
  const level = String(chart.level ?? '').trim();
  return [playStyle, difficulty, level].filter((part) => part.length > 0).join(' ');
}

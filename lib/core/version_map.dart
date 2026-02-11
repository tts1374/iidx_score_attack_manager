const Map<String, String> versionLabelMap = {
  '1': '1st style',
  'SS': 'substream',
  '0': 'INFINITAS',
  '2': '2nd style',
  '3': '3rd style',
  '4': '4th style',
  '5': '5th style',
  '6': '6th style',
  '7': '7th style',
  '8': '8th style',
  '9': '9th style',
  '10': '10th style',
  '11': 'IIDX RED',
  '12': 'HAPPY SKY',
  '13': 'DistorteD',
  '14': 'GOLD',
  '15': 'DJ TROOPERS',
  '16': 'EMPRESS',
  '17': 'SIRIUS',
  '18': 'Resort Anthem',
  '19': 'Lincle',
  '20': 'tricoro',
  '21': 'SPADA',
  '22': 'PENDUAL',
  '23': 'copula',
  '24': 'SINOBUZ',
  '25': 'CANNON BALLERS',
  '26': 'Rootage',
  '27': 'HEROIC VERSE',
  '28': 'BISTROVER',
  '29': 'CastHour',
  '30': 'RESIDENT',
  '31': 'EPOLIS',
  '32': 'Pinky Crush',
  '33': 'Sparkle Shower',
};

String formatVersionLabel(String raw) {
  final key = raw.trim();
  final label = versionLabelMap[key] ?? key;
  if (label.isEmpty) {
    return '';
  }
  return '[$label]';
}

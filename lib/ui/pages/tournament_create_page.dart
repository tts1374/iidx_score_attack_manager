import 'package:flutter/material.dart';
import 'dart:io';

import 'package:diacritic/diacritic.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:search_choices/search_choices.dart';

import '../../core/constants.dart';
import '../../core/date_utils.dart';
import '../../core/version_map.dart';
import '../../application/validators/tournament_input_validator.dart';
import '../../data/models/song_master.dart';
import '../../data/models/tournament.dart';
import '../../data/models/tournament_chart.dart';
import '../../providers/data_source_providers.dart';
import '../../providers/system_providers.dart';
import '../../providers/use_case_providers.dart';

class TournamentCreatePage extends ConsumerStatefulWidget {
  const TournamentCreatePage({super.key});

  static const String routeName = '/tournaments/create';

  @override
  ConsumerState<TournamentCreatePage> createState() =>
      _TournamentCreatePageState();
}

class _TournamentCreatePageState extends ConsumerState<TournamentCreatePage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _ownerController = TextEditingController();
  final _hashtagController = TextEditingController();

  String? _startDate;
  String? _endDate;
  bool _saving = false;
  XFile? _backgroundImage;

  final List<_ChartSelectionState> _selections = [];
  late Future<List<SongMasterMusic>> _musicOptionsFuture;

  @override
  void initState() {
    super.initState();
    _musicOptionsFuture = ref.read(songMasterUseCaseProvider).fetchActiveMusic();
    _addSelection();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _ownerController.dispose();
    _hashtagController.dispose();
    for (final selection in _selections) {
      selection.dispose();
    }
    super.dispose();
  }

  void _addSelection() {
    if (_selections.length >= maxChartsPerTournament) return;
    setState(() {
      _selections.add(_ChartSelectionState());
    });
  }

  void _removeSelection(_ChartSelectionState selection) {
    setState(() {
      _selections.remove(selection);
      selection.dispose();
    });
  }

  Future<void> _pickStartDate() async {
    final now = ref.read(nowJstProvider)();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        _startDate = formatYmd(picked);
        if (_endDate != null && _endDate!.compareTo(_startDate!) < 0) {
          _endDate = _startDate;
        }
      });
    }
  }

  Future<void> _pickEndDate() async {
    final now = ref.read(nowJstProvider)();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        _endDate = formatYmd(picked);
      });
    }
  }

  Future<void> _onMusicSelected(
    _ChartSelectionState selection,
    SongMasterMusic music,
  ) async {
    selection.music = music;
    selection.playStyle = null;
    selection.difficulty = null;
    selection.charts = await ref
        .read(songMasterUseCaseProvider)
        .fetchChartsByMusic(
      music.musicId,
    );
    if (!mounted) return;
    setState(() {});
  }

  void _onPlayStyleSelected(
    _ChartSelectionState selection,
    String value,
  ) {
    setState(() {
      selection.playStyle = value;
      selection.difficulty = null;
    });
  }

  void _onDifficultySelected(
    _ChartSelectionState selection,
    String value,
  ) {
    setState(() {
      selection.difficulty = value;
    });
  }

  Future<void> _save() async {
    if (_saving) return;
    if (!_formKey.currentState!.validate()) return;
    final dateValidation = TournamentInputValidator.validateDateRange(
      startDate: _startDate,
      endDate: _endDate,
      now: ref.read(nowJstProvider)(),
    );
    if (dateValidation != null) {
      await _showMessage(dateValidation);
      return;
    }
    if (_selections.isEmpty) {
      await _showMessage('譜面を1件以上追加してください。');
      return;
    }

    final selectedCharts = <_ResolvedChart>[];
    for (final selection in _selections) {
      if (selection.music == null ||
          selection.playStyle == null ||
          selection.difficulty == null) {
        await _showMessage('曲/プレイスタイル/難易度を選択してください。');
        return;
      }
      final chart = selection.charts.firstWhere(
        (c) =>
            c.playStyle == selection.playStyle &&
            c.difficulty == selection.difficulty &&
            c.isActive == 1,
        orElse: () => SongMasterChart(
          chartId: -1,
          musicId: selection.music!.musicId,
          playStyle: selection.playStyle!,
          difficulty: selection.difficulty!,
          level: 0,
          isActive: 0,
        ),
      );
      if (chart.chartId <= 0) {
        await _showMessage('選択した難易度が有効ではありません。');
        return;
      }
      selectedCharts.add(_ResolvedChart(selection.music!, chart));
    }

    final duplicate = _findDuplicateChart(selectedCharts);
    if (duplicate != null) {
      await _showMessage('同じ譜面が重複しています: ${duplicate.title}');
      return;
    }

    setState(() => _saving = true);
    final uuid = ref.read(uuidV4Provider)();
    final now = ref.read(nowJstProvider)().toIso8601String();
    String? backgroundPath;
    if (_backgroundImage != null) {
      backgroundPath = await _copyBackgroundImage(uuid, _backgroundImage!);
    }
    final tournament = Tournament(
      tournamentUuid: uuid,
      tournamentName: _nameController.text.trim(),
      owner: _ownerController.text.trim(),
      hashtag: _hashtagController.text.trim(),
      startDate: _startDate!,
      endDate: _endDate!,
      isImported: false,
      backgroundImagePath: backgroundPath,
      createdAt: now,
      updatedAt: now,
    );

    final charts = selectedCharts.asMap().entries.map((entry) {
      return TournamentChart(
        tournamentChartId: null,
        tournamentUuid: uuid,
        chartId: entry.value.chart.chartId,
        sortOrder: entry.key + 1,
        createdAt: now,
      );
    }).toList();

    await ref.read(tournamentUseCaseProvider).createTournament(tournament, charts);
    if (!mounted) return;
    setState(() => _saving = false);
    Navigator.of(context).pop(true);
  }

  _ResolvedChart? _findDuplicateChart(List<_ResolvedChart> charts) {
    final seen = <int, _ResolvedChart>{};
    for (final item in charts) {
      if (seen.containsKey(item.chart.chartId)) {
        return item;
      }
      seen[item.chart.chartId] = item;
    }
    return null;
  }

  Set<String> _availableDifficulties(_ChartSelectionState selection) {
    if (selection.playStyle == null) {
      return {};
    }
    return selection.charts
        .where(
          (c) => c.playStyle == selection.playStyle && c.isActive == 1,
        )
        .map((c) => c.difficulty)
        .toSet();
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

  Future<void> _pickBackgroundImage() async {
    final picked = await ref
        .read(imagePickerDataSourceProvider)
        .pickImage(source: ImageSource.gallery);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    final decoded = img.decodeImage(bytes);
    if (decoded == null) {
      await _showMessage('画像の読み込みに失敗しました。');
      return;
    }
    if (!_isValidAspect(decoded.width, decoded.height)) {
      await _showMessage('背景画像は9:16の比率にしてください。');
      return;
    }
    setState(() {
      _backgroundImage = picked;
    });
  }

  bool _isValidAspect(int width, int height) {
    if (width == 0 || height == 0) return false;
    final ratio = width / height;
    const target = 9 / 16;
    return (ratio - target).abs() < 0.01;
  }

  Future<String> _copyBackgroundImage(String uuid, XFile picked) async {
    final dir = await ref.read(appSupportDirectoryProvider)();
    final ext = p.extension(picked.name);
    final filename = '${uuid}_background${ext.isEmpty ? '.jpg' : ext}';
    final path = p.join(dir.path, filename);
    final bytes = await picked.readAsBytes();
    await ref.read(fileSystemProvider).writeAsBytes(path, bytes, flush: true);
    return path;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('大会作成')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: '大会名'),
              maxLength: maxTournamentNameLength,
              validator: (value) =>
                  value == null || value.trim().isEmpty ? '必須です' : null,
            ),
            TextFormField(
              controller: _ownerController,
              decoration: const InputDecoration(labelText: '開催者'),
              maxLength: maxOwnerLength,
              validator: (value) =>
                  value == null || value.trim().isEmpty ? '必須です' : null,
            ),
            TextFormField(
              controller: _hashtagController,
              decoration: const InputDecoration(labelText: 'ハッシュタグ'),
              maxLength: maxHashtagLength,
              validator: (value) =>
                  value == null || value.trim().isEmpty ? '必須です' : null,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _pickStartDate,
                    child: Text(_startDate ?? '開始日'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: _pickEndDate,
                    child: Text(_endDate ?? '終了日'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('曲/譜面'),
                TextButton.icon(
                  onPressed: _selections.length >= maxChartsPerTournament
                      ? null
                      : _addSelection,
                  icon: const Icon(Icons.add),
                  label: const Text('追加'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            FutureBuilder<List<SongMasterMusic>>(
              future: _musicOptionsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return const Text('曲マスタの読み込みに失敗しました。');
                }
                final options = snapshot.data ?? [];
                return Column(
                  children: [
                    for (final selection in _selections)
                      _ChartSelectionCard(
                        selection: selection,
                        musicOptions: options,
                        availableDifficulties:
                            _availableDifficulties(selection),
                        onMusicSelected: (music) =>
                            _onMusicSelected(selection, music),
                        onPlayStyleSelected: (value) =>
                            _onPlayStyleSelected(selection, value),
                        onDifficultySelected: (value) =>
                            _onDifficultySelected(selection, value),
                        onRemove: () => _removeSelection(selection),
                      ),
                  ],
                );
              },
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(child: _BackgroundThumbnail(
                  image: _backgroundImage,
                  onClear: () => setState(() => _backgroundImage = null),
                )),
                const SizedBox(width: 12),
                OutlinedButton.icon(
                  onPressed: _pickBackgroundImage,
                  icon: const Icon(Icons.image),
                  label: const Text('背景画像を選択'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const CircularProgressIndicator()
                  : const Text('作成'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChartSelectionState {
  SongMasterMusic? music;
  String? playStyle;
  String? difficulty;
  List<SongMasterChart> charts = [];

  void dispose() {}
}

class _ResolvedChart {
  _ResolvedChart(this.music, this.chart);

  final SongMasterMusic music;
  final SongMasterChart chart;

  String get title => music.title;
}

class _ChartSelectionCard extends StatelessWidget {
  const _ChartSelectionCard({
    required this.selection,
    required this.musicOptions,
    required this.availableDifficulties,
    required this.onMusicSelected,
    required this.onPlayStyleSelected,
    required this.onDifficultySelected,
    required this.onRemove,
  });

  final _ChartSelectionState selection;
  final List<SongMasterMusic> musicOptions;
  final Set<String> availableDifficulties;
  final ValueChanged<SongMasterMusic> onMusicSelected;
  final ValueChanged<String> onPlayStyleSelected;
  final ValueChanged<String> onDifficultySelected;
  final VoidCallback onRemove;

  static const _difficulties = [
    'BEGINNER',
    'NORMAL',
    'HYPER',
    'ANOTHER',
    'LEGGENDARIA',
  ];

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: _buildMusicField(context)),
                IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.delete),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _buildPlayStyleRow(),
            const SizedBox(height: 8),
            _buildDifficultyRow(),
          ],
        ),
      ),
    );
  }

  Widget _buildMusicField(BuildContext context) {
    return SearchChoices.single(
      items: musicOptions
          .map(
            (music) => DropdownMenuItem<SongMasterMusic>(
              value: music,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    formatVersionLabel(music.version),
                    style: const TextStyle(
                      fontSize: 12,
                      color: Colors.black54,
                    ),
                  ),
                  Text(music.title),
                ],
              ),
            ),
          )
          .toList(),
      value: selection.music,
      hint: const Text('曲名'),
      searchHint: const Text('曲名を検索'),
      onChanged: (value) {
        if (value != null) {
          onMusicSelected(value);
        }
      },
      isExpanded: true,
      displayClearIcon: false,
      dialogBox: true,
      searchFn: (keyword, items) {
        final query = _normalize(keyword);
        final filtered = <int>[];
        for (var i = 0; i < items.length; i++) {
          final item = items[i];
          final music = item.value;
          if (music != null &&
              _normalize(music.title).contains(query)) {
            filtered.add(i);
          }
        }
        return filtered;
      },
    );
  }

  Widget _buildPlayStyleRow() {
    return Row(
      children: [
        _PlayStyleChip(
          label: 'SP',
          selected: selection.playStyle == 'SP',
          enabled: selection.music != null,
          onSelected: () => onPlayStyleSelected('SP'),
        ),
        const SizedBox(width: 8),
        _PlayStyleChip(
          label: 'DP',
          selected: selection.playStyle == 'DP',
          enabled: selection.music != null,
          onSelected: () => onPlayStyleSelected('DP'),
        ),
      ],
    );
  }

  Widget _buildDifficultyRow() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          children: [
            for (final diff in _difficulties)
              _DifficultyChip(
                label: diff,
                color: _difficultyColor(diff),
                selected: selection.difficulty == diff,
                enabled: _isDifficultyEnabled(diff),
                onSelected: () => onDifficultySelected(diff),
              ),
          ],
        ),
      ],
    );
  }

  bool _isDifficultyEnabled(String difficulty) {
    if (selection.music == null || selection.playStyle == null) {
      return false;
    }
    return availableDifficulties.contains(difficulty);
  }

  Color _difficultyColor(String difficulty) {
    switch (difficulty) {
      case 'BEGINNER':
        return const Color(0xFF79D100);
      case 'NORMAL':
        return const Color(0xFF20A8FF);
      case 'HYPER':
        return const Color(0xFFFF7800);
      case 'ANOTHER':
        return const Color(0xFFFF0000);
      case 'LEGGENDARIA':
        return const Color(0xFFCE00D6);
      default:
        return Colors.grey;
    }
  }
}

class _PlayStyleChip extends StatelessWidget {
  const _PlayStyleChip({
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: enabled ? (_) => onSelected() : null,
      showCheckmark: false,
    );
  }
}

class _DifficultyChip extends StatelessWidget {
  const _DifficultyChip({
    required this.label,
    required this.color,
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });

  final String label;
  final Color color;
  final bool selected;
  final bool enabled;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    final textColor = selected ? Colors.white : color;
    return ChoiceChip(
      label: Text(label, style: TextStyle(color: textColor)),
      selected: selected,
      onSelected: enabled ? (_) => onSelected() : null,
      showCheckmark: false,
      selectedColor: color,
      disabledColor: Colors.grey.shade400,
      side: BorderSide(color: color),
    );
  }
}

String _normalize(String value) {
  var normalized = value.toLowerCase().trim();
  const replacements = {
    'ä': 'a',
    'ö': 'o',
    'ü': 'u',
    'ß': 'ss',
    'æ': 'ae',
    'œ': 'oe',
    'ø': 'o',
    'å': 'a',
    'ç': 'c',
    'ñ': 'n',
    'á': 'a',
    'à': 'a',
    'â': 'a',
    'ã': 'a',
    'é': 'e',
    'è': 'e',
    'ê': 'e',
    'ë': 'e',
    'í': 'i',
    'ì': 'i',
    'î': 'i',
    'ï': 'i',
    'ó': 'o',
    'ò': 'o',
    'ô': 'o',
    'õ': 'o',
    'ú': 'u',
    'ù': 'u',
    'û': 'u',
    'ý': 'y',
    'ÿ': 'y',
  };
  for (final entry in replacements.entries) {
    normalized = normalized.replaceAll(entry.key, entry.value);
  }
  return removeDiacritics(normalized);
}

class _BackgroundThumbnail extends StatelessWidget {
  const _BackgroundThumbnail({
    required this.image,
    required this.onClear,
  });

  final XFile? image;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 9 / 16,
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: image == null
                  ? Container(
                      color: Colors.grey.shade300,
                      alignment: Alignment.center,
                      child: const Text('未選択'),
                    )
                  : Image.file(
                      File(image!.path),
                      fit: BoxFit.cover,
                    ),
            ),
          ),
          if (image != null)
            Positioned(
              top: 6,
              right: 6,
              child: InkWell(
                onTap: onClear,
                child: Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.close, color: Colors.white, size: 18),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

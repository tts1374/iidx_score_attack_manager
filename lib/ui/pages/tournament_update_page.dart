import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/date_utils.dart';
import '../../data/models/tournament.dart';
import '../../providers/use_case_providers.dart';

class TournamentUpdatePage extends ConsumerStatefulWidget {
  const TournamentUpdatePage({super.key});

  static const String routeName = '/tournaments/update';

  @override
  ConsumerState<TournamentUpdatePage> createState() =>
      _TournamentUpdatePageState();
}

class _TournamentUpdatePageState extends ConsumerState<TournamentUpdatePage> {
  late Future<Tournament> _tournament;
  XFile? _backgroundImage;
  String? _existingBackgroundPath;
  bool _saving = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final uuid = ModalRoute.of(context)!.settings.arguments as String;
    _tournament = _load(uuid);
  }

  Future<Tournament> _load(String uuid) async {
    final tournament = await ref.read(tournamentUseCaseProvider).fetchByUuid(uuid);
    if (tournament == null) {
      throw StateError('Tournament not found');
    }
    _existingBackgroundPath = tournament.backgroundImagePath;
    return tournament;
  }

  Future<void> _pickBackgroundImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
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
      _existingBackgroundPath = null;
    });
  }

  bool _isValidAspect(int width, int height) {
    if (width == 0 || height == 0) return false;
    final ratio = width / height;
    const target = 9 / 16;
    return (ratio - target).abs() < 0.01;
  }

  Future<String> _copyBackgroundImage(String uuid, XFile picked) async {
    final dir = await getApplicationSupportDirectory();
    final ext = p.extension(picked.name);
    final filename = '${uuid}_background${ext.isEmpty ? '.jpg' : ext}';
    final path = p.join(dir.path, filename);
    final bytes = await picked.readAsBytes();
    await XFile.fromData(bytes).saveTo(path);
    return path;
  }

  Future<void> _save(Tournament tournament) async {
    if (_saving) return;
    setState(() => _saving = true);
    String? path = _existingBackgroundPath;
    if (_backgroundImage != null) {
      path = await _copyBackgroundImage(
        tournament.tournamentUuid,
        _backgroundImage!,
      );
    }
    await ref.read(tournamentUseCaseProvider).updateBackgroundImage(
      tournament.tournamentUuid,
      path,
      nowJst().toIso8601String(),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    Navigator.of(context).pop(true);
  }

  Future<void> _clearBackground() async {
    setState(() {
      _backgroundImage = null;
      _existingBackgroundPath = null;
    });
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('大会更新')),
      body: FutureBuilder<Tournament>(
        future: _tournament,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(child: Text('読み込みに失敗しました。'));
          }
          final tournament = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                tournament.tournamentName,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              _LabeledText(label: '開催者', value: tournament.owner),
              _LabeledText(label: 'ハッシュタグ', value: tournament.hashtag),
              _LabeledText(
                label: '期間',
                value: '${tournament.startDate}～${tournament.endDate}',
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _BackgroundThumbnail(
                      image: _backgroundImage,
                      existingPath: _existingBackgroundPath,
                      onClear: _clearBackground,
                    ),
                  ),
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
                onPressed: _saving ? null : () => _save(tournament),
                child: _saving
                    ? const CircularProgressIndicator()
                    : const Text('更新'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _BackgroundThumbnail extends StatelessWidget {
  const _BackgroundThumbnail({
    required this.image,
    required this.existingPath,
    required this.onClear,
  });

  final XFile? image;
  final String? existingPath;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final hasImage = image != null || existingPath != null;
    return AspectRatio(
      aspectRatio: 9 / 16,
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: hasImage
                  ? _buildImage()
                  : Container(
                      color: Colors.grey.shade300,
                      alignment: Alignment.center,
                      child: const Text('未選択'),
                    ),
            ),
          ),
          if (hasImage)
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

  Widget _buildImage() {
    if (image != null) {
      return Image.file(File(image!.path), fit: BoxFit.cover);
    }
    return Image.file(File(existingPath!), fit: BoxFit.cover);
  }
}

class _LabeledText extends StatelessWidget {
  const _LabeledText({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: const TextStyle(color: Colors.black54),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

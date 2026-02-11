import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../app_services.dart';
import '../../core/date_utils.dart';
import '../../core/difficulty_color.dart';
import '../../data/models/song_master.dart';
import '../../data/models/tournament.dart';
import '../../services/evidence_service.dart';

class EvidenceRegisterPage extends StatefulWidget {
  const EvidenceRegisterPage({super.key});

  static const String routeName = '/evidences/register';

  @override
  State<EvidenceRegisterPage> createState() => _EvidenceRegisterPageState();
}

class _EvidenceRegisterPageState extends State<EvidenceRegisterPage> {
  final _services = AppServices.instance;
  late Future<_EvidenceRegisterView> _view;

  XFile? _selectedImage;
  bool _saving = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args = ModalRoute.of(context)!.settings.arguments as EvidenceRegisterArgs;
    _view = _load(args);
  }

  Future<_EvidenceRegisterView> _load(EvidenceRegisterArgs args) async {
    final tournament = await _services.tournamentRepo.fetchByUuid(args.tournamentUuid);
    if (tournament == null) {
      throw StateError('Tournament not found');
    }
    final chartInfo = await _services.songMasterRepo.fetchChartById(args.chartId);
    SongMasterMusic? music;
    if (chartInfo != null) {
      music = await _services.songMasterRepo.fetchMusicById(chartInfo.musicId);
    }
    final evidence =
        await _services.evidenceRepo.fetchEvidence(args.tournamentUuid, args.chartId);
    return _EvidenceRegisterView(
      tournament: tournament,
      chartInfo: chartInfo,
      music: music,
      evidencePath: evidence?.filePath,
    );
  }

  Future<void> _pickImage(ImageSource source, {required bool canRegister}) async {
    if (!canRegister || _saving) {
      return;
    }
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source);
    if (picked == null || !mounted) {
      return;
    }
    setState(() {
      _selectedImage = picked;
    });
  }

  Future<void> _submit(_EvidenceRegisterView view, {required bool canRegister}) async {
    if (view.chartInfo == null) {
      await _showMessage('曲マスタが読み込めません。');
      return;
    }
    if (!canRegister) {
      await _showMessage('期間外のため提出出来ません。');
      return;
    }
    if (_selectedImage == null) {
      await _showMessage('画像を選択してください。');
      return;
    }

    setState(() {
      _saving = true;
    });

    final result = await _services.evidenceService.registerEvidenceFile(
      tournamentUuid: view.tournament.tournamentUuid,
      chartId: view.chartInfo!.chartId,
      picked: _selectedImage!,
    );

    if (!mounted) {
      return;
    }

    setState(() {
      _saving = false;
    });

    switch (result.status) {
      case EvidenceSaveStatus.saved:
        Navigator.of(context).pop(true);
        break;
      case EvidenceSaveStatus.noChange:
        await _showMessage('更新なしです。');
        break;
      case EvidenceSaveStatus.cancelled:
        break;
      case EvidenceSaveStatus.failed:
        await _showMessage(result.message ?? '保存に失敗しました。');
        break;
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

  Widget _buildScoreCard(_EvidenceRegisterView view, bool canRegister) {
    final styleDiff = '${view.chartInfo?.playStyle ?? ''} ${view.chartInfo?.difficulty ?? ''}'
        .trim();
    final diffColor = difficultyColor(view.chartInfo?.difficulty);
    final levelText = 'Lv${view.chartInfo?.level ?? 0}';
    final statusColor = canRegister ? const Color(0xFF2E8B57) : const Color(0xFFDC2626);
    final statusIcon = canRegister ? Icons.check_circle : Icons.error;
    final statusText = canRegister ? '提出可能です' : '期間外のため提出出来ません';

    return Card(
      margin: EdgeInsets.zero,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
            decoration: const BoxDecoration(
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF344C87), Color(0xFF40599A)],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: diffColor.withValues(alpha: 0.32),
                    border: Border.all(
                      color: diffColor.withValues(alpha: 0.85),
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    styleDiff.isEmpty ? '-' : styleDiff,
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  view.music?.title ?? '不明な曲',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w500,
                    height: 1.18,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  levelText,
                  style: const TextStyle(
                    color: Color(0xFFE2E8F0),
                    fontSize: 18,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
            child: Row(
              children: [
                Icon(statusIcon, color: statusColor, size: 30),
                const SizedBox(width: 10),
                Text(
                  statusText,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPickerCard(bool canRegister) {
    return Card(
      margin: EdgeInsets.zero,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Column(
        children: [
          ListTile(
            enabled: canRegister && !_saving,
            leading: const Icon(Icons.image, color: Color(0xFF415B9A)),
            title: const Text('ギャラリーから選択'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _pickImage(
              ImageSource.gallery,
              canRegister: canRegister,
            ),
          ),
          Divider(height: 1, color: Colors.grey.shade200),
          ListTile(
            enabled: canRegister && !_saving,
            leading: const Icon(Icons.camera_alt, color: Color(0xFF415B9A)),
            title: const Text('カメラで撮影'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _pickImage(
              ImageSource.camera,
              canRegister: canRegister,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSelectedImagePreview(String? existingEvidencePath) {
    final selected = _selectedImage;
    final isSelectedImage = selected != null;
    File? file;
    String name;
    String stateLabel;

    if (isSelectedImage) {
      file = File(selected.path);
      name = selected.name;
      stateLabel = '選択中';
    } else if (existingEvidencePath != null) {
      final existing = File(existingEvidencePath);
      if (existing.existsSync()) {
        file = existing;
      }
      name = existing.uri.pathSegments.isNotEmpty
          ? existing.uri.pathSegments.last
          : '登録済み画像';
      stateLabel = '登録済み画像';
    } else {
      return const SizedBox.shrink();
    }

    if (file == null) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.file(
              file,
              width: 62,
              height: 62,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Container(
                width: 62,
                height: 62,
                color: Colors.grey.shade300,
                alignment: Alignment.center,
                child: const Icon(Icons.broken_image),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  stateLabel,
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.grey.shade700,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  bool _hasPreview(String? existingEvidencePath) {
    if (_selectedImage != null) {
      return true;
    }
    if (existingEvidencePath == null) {
      return false;
    }
    return File(existingEvidencePath).existsSync();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF2F1FA),
      appBar: AppBar(
        title: const Text('スコア提出'),
      ),
      body: FutureBuilder<_EvidenceRegisterView>(
        future: _view,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(child: Text('読み込みに失敗しました。'));
          }

          final view = snapshot.data!;
          final canRegister = isActiveTournament(
            view.tournament.startDate,
            view.tournament.endDate,
          );
          final canSubmit = canRegister && _selectedImage != null && !_saving;
          final showPreview = _hasPreview(view.evidencePath);

          return Column(
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        view.tournament.tournamentName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              color: const Color(0xFF28427D),
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                      const SizedBox(height: 14),
                      _buildScoreCard(view, canRegister),
                      const Spacer(),
                      if (showPreview) ...[
                        _buildSelectedImagePreview(view.evidencePath),
                        const SizedBox(height: 12),
                      ],
                      _buildPickerCard(canRegister),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF3E5A9E),
                      disabledBackgroundColor: const Color(0xFFB8C3DD),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      textStyle: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    onPressed: canSubmit
                        ? () => _submit(
                              view,
                              canRegister: canRegister,
                            )
                        : null,
                    icon: _saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.camera_alt),
                    label: const Text('スコア画像を提出'),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class EvidenceRegisterArgs {
  EvidenceRegisterArgs({required this.tournamentUuid, required this.chartId});

  final String tournamentUuid;
  final int chartId;
}

class _EvidenceRegisterView {
  _EvidenceRegisterView({
    required this.tournament,
    required this.chartInfo,
    required this.music,
    required this.evidencePath,
  });

  final Tournament tournament;
  final SongMasterChart? chartInfo;
  final SongMasterMusic? music;
  final String? evidencePath;
}

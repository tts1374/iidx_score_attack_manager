import 'package:flutter/material.dart';

import '../../app_services.dart';
import '../../core/constants.dart';
import '../../services/song_master_service.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  static const String routeName = '/settings';

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final _services = AppServices.instance;
  late Future<_SettingsView> _view;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    _view = _load();
  }

  Future<_SettingsView> _load() async {
    final updatedAt =
        await _services.settingsRepo.getValue(settingSongMasterAssetUpdatedAt);
    final downloadedAt =
        await _services.settingsRepo.getValue(settingSongMasterDownloadedAt);
    final schemaVersion =
        await _services.settingsRepo.getValue(settingSongMasterSchemaVersion);
    final updateSource =
        await _services.settingsRepo.getValue(settingSongMasterUpdateSource);
    return _SettingsView(
      assetUpdatedAt: updatedAt,
      downloadedAt: downloadedAt,
      schemaVersion: schemaVersion,
      updateSource: updateSource,
    );
  }

  Future<void> _refreshMaster() async {
    if (_checking) return;
    setState(() => _checking = true);
    final result = await _services.songMasterService.checkAndUpdateIfNeeded();
    if (!mounted) return;
    setState(() {
      _checking = false;
      _view = _load();
    });
    if (result.status == SongMasterUpdateStatus.updated ||
        result.status == SongMasterUpdateStatus.upToDate) {
      await _showMessage('曲マスタは最新です。');
    } else {
      await _showMessage(result.message ?? '更新に失敗しました。');
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('設定')),
      body: FutureBuilder<_SettingsView>(
        future: _view,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(child: Text('読み込みに失敗しました。'));
          }
          final view = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              ListTile(
                title: const Text('曲マスタ更新日時'),
                subtitle: Text(view.assetUpdatedAt ?? '未取得'),
              ),
              ListTile(
                title: const Text('ダウンロード日時'),
                subtitle: Text(view.downloadedAt ?? '未取得'),
              ),
              ListTile(
                title: const Text('スキーマバージョン'),
                subtitle: Text(view.schemaVersion ?? '未取得'),
              ),
              ListTile(
                title: const Text('更新元'),
                subtitle: Text(_formatSource(view.updateSource)),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _checking ? null : _refreshMaster,
                child: _checking
                    ? const CircularProgressIndicator()
                    : const Text('更新確認'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SettingsView {
  _SettingsView({
    required this.assetUpdatedAt,
    required this.downloadedAt,
    required this.schemaVersion,
    required this.updateSource,
  });

  final String? assetUpdatedAt;
  final String? downloadedAt;
  final String? schemaVersion;
  final String? updateSource;
}

String _formatSource(String? source) {
  switch (source) {
    case songMasterSourceGithubDownload:
      return 'GitHubダウンロード';
    case songMasterSourceGithubMetadata:
      return 'GitHubメタ更新';
    case songMasterSourceLocalCache:
      return 'ローカルキャッシュ';
    default:
      return '未取得';
  }
}

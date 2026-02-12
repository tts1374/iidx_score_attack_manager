import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants.dart';
import '../../providers/use_case_providers.dart';
import '../../services/song_master_service.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  static const String routeName = '/settings';

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  late Future<_SettingsView> _view;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    _view = _load();
  }

  Future<_SettingsView> _load() async {
    final settings = ref.read(settingsUseCaseProvider);
    final updatedAt = await settings.getValue(settingSongMasterAssetUpdatedAt);
    final downloadedAt = await settings.getValue(settingSongMasterDownloadedAt);
    final schemaVersion = await settings.getValue(settingSongMasterSchemaVersion);
    final updateSource = await settings.getValue(settingSongMasterUpdateSource);
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
    final result = await ref.read(songMasterUseCaseProvider).checkAndUpdateIfNeeded();
    if (!mounted) return;
    setState(() {
      _checking = false;
      _view = _load();
    });
    if (result.status == SongMasterUpdateStatus.updated ||
        result.status == SongMasterUpdateStatus.upToDate) {
      await _showMessage('\u66f2\u30de\u30b9\u30bf\u306f\u6700\u65b0\u3067\u3059\u3002');
    } else {
      await _showMessage(
        result.message ?? '\u66f4\u65b0\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002',
      );
    }
  }

  Future<void> _showMessage(String message) async {
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('\u901a\u77e5'),
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
      appBar: AppBar(title: const Text('\u8a2d\u5b9a')),
      body: FutureBuilder<_SettingsView>(
        future: _view,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(
              child: Text('\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002'),
            );
          }
          final view = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              ListTile(
                title: const Text('\u66f2\u30de\u30b9\u30bf\u66f4\u65b0\u65e5\u6642'),
                subtitle: Text(
                  view.assetUpdatedAt ?? '\u672a\u53d6\u5f97',
                ),
              ),
              ListTile(
                title: const Text('\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u65e5\u6642'),
                subtitle: Text(
                  view.downloadedAt ?? '\u672a\u53d6\u5f97',
                ),
              ),
              ListTile(
                title: const Text('\u30b9\u30ad\u30fc\u30de\u30d0\u30fc\u30b8\u30e7\u30f3'),
                subtitle: Text(
                  view.schemaVersion ?? '\u672a\u53d6\u5f97',
                ),
              ),
              ListTile(
                title: const Text('\u66f4\u65b0\u5143'),
                subtitle: Text(_formatSource(view.updateSource)),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _checking ? null : _refreshMaster,
                child: _checking
                    ? const CircularProgressIndicator()
                    : const Text('\u66f4\u65b0\u78ba\u8a8d'),
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
      return 'GitHub\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9';
    case songMasterSourceGithubMetadata:
      return 'GitHub\u30e1\u30bf\u66f4\u65b0';
    case songMasterSourceLocalCache:
      return '\u30ed\u30fc\u30ab\u30eb\u30ad\u30e3\u30c3\u30b7\u30e5';
    default:
      return '\u672a\u53d6\u5f97';
  }
}

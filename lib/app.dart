import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_sharing_intent/model/sharing_file.dart';

import 'app_services.dart';
import 'core/constants.dart';
import 'services/qr_from_image_service.dart';
import 'services/share_intent_service.dart';
import 'services/tournament_import_service.dart';
import 'ui/pages/evidence_register_page.dart';
import 'ui/pages/home_page.dart';
import 'ui/pages/post_support_page.dart';
import 'ui/pages/settings_page.dart';
import 'ui/pages/tournament_create_page.dart';
import 'ui/pages/tournament_detail_page.dart';
import 'ui/pages/tournament_import_page.dart';
import 'ui/pages/tournament_update_page.dart';

class ScoreAttackApp extends StatefulWidget {
  const ScoreAttackApp({super.key});

  @override
  State<ScoreAttackApp> createState() => _ScoreAttackAppState();
}

class _ScoreAttackAppState extends State<ScoreAttackApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  final _scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();
  final _shareIntentService = ShareIntentService();
  final _importService = TournamentImportService(AppServices.instance);

  StreamSubscription<List<SharedFile>>? _shareSubscription;
  Future<void> _shareQueue = Future<void>.value();
  static const _msgReadSharedDataFailed =
      '\u5171\u6709\u30c7\u30fc\u30bf\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002';
  static const _msgProcessSharedDataFailed =
      '\u5171\u6709\u30c7\u30fc\u30bf\u306e\u51e6\u7406\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002';
  static const _msgNoSharedImage =
      '\u753b\u50cf\u304c\u5171\u6709\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002';
  static const _msgImportSuccess = '\u5927\u4f1a\u3092\u53d6\u308a\u8fbc\u307f\u307e\u3057\u305f\u3002';
  static const _msgQrDecodeFailed = '\u0051\u0052\u306e\u8aad\u307f\u53d6\u308a\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002';
  static const _msgQrNotFoundInImage =
      '\u753b\u50cf\u5185\u306b\u0051\u0052\u30b3\u30fc\u30c9\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002';

  @override
  void initState() {
    super.initState();
    _initShareIntentHandling();
  }

  Future<void> _initShareIntentHandling() async {
    try {
      final initialFiles = await _shareIntentService.getInitialFiles();
      _enqueueShareHandling(initialFiles);
    } catch (_) {
      _showMessage(_msgReadSharedDataFailed);
    }

    _shareSubscription = _shareIntentService.mediaStream().listen(
      _enqueueShareHandling,
      onError: (_) => _showMessage(_msgReadSharedDataFailed),
    );
  }

  void _enqueueShareHandling(List<SharedFile> files) {
    if (files.isEmpty) return;
    _shareQueue = _shareQueue
        .catchError((_) {})
        .then((_) => _handleSharedFiles(files))
        .catchError((_) => _showMessage(_msgProcessSharedDataFailed));
  }

  Future<void> _handleSharedFiles(List<SharedFile> files) async {
    final imagePaths = files
        .where(_isImageSharedFile)
        .map((file) => file.value)
        .whereType<String>()
        .toList();

    if (imagePaths.isEmpty) {
      _showMessage(_msgNoSharedImage);
      _shareIntentService.reset();
      return;
    }

    for (final path in imagePaths) {
      if (!await File(path).exists()) {
        continue;
      }

      final rawValue = await QrFromImageService.tryExtractQrRawValue(path);
      if (rawValue == null || rawValue.isEmpty) {
        continue;
      }

      final result = await _importService.importFromQrRawValue(rawValue);
      if (result.success) {
        _showMessage(_msgImportSuccess);
      } else {
        _showMessage(result.message ?? _msgQrDecodeFailed);
      }
      _shareIntentService.reset();
      return;
    }

    _showMessage(_msgQrNotFoundInImage);
    _shareIntentService.reset();
  }

  bool _isImageSharedFile(SharedFile file) {
    if (file.type == SharedMediaType.IMAGE) return true;
    final mimeType = file.mimeType?.toLowerCase() ?? '';
    if (mimeType.startsWith('image/')) return true;
    final value = file.value?.toLowerCase() ?? '';
    return value.endsWith('.png') ||
        value.endsWith('.jpg') ||
        value.endsWith('.jpeg') ||
        value.endsWith('.webp');
  }

  void _showMessage(String message) {
    _scaffoldMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  void dispose() {
    _shareSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      scaffoldMessengerKey: _scaffoldMessengerKey,
      title: appName,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2E5AAC)),
        useMaterial3: true,
      ),
      initialRoute: HomePage.routeName,
      routes: {
        HomePage.routeName: (_) => const HomePage(),
        TournamentCreatePage.routeName: (_) => const TournamentCreatePage(),
        TournamentImportPage.routeName: (_) => const TournamentImportPage(),
        TournamentDetailPage.routeName: (_) => const TournamentDetailPage(),
        TournamentUpdatePage.routeName: (_) => const TournamentUpdatePage(),
        EvidenceRegisterPage.routeName: (_) => const EvidenceRegisterPage(),
        PostSupportPage.routeName: (_) => const PostSupportPage(),
        SettingsPage.routeName: (_) => const SettingsPage(),
      },
    );
  }
}

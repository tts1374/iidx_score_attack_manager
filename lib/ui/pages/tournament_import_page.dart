import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../app_services.dart';
import '../../services/tournament_import_service.dart';

class TournamentImportPage extends StatefulWidget {
  const TournamentImportPage({super.key});

  static const String routeName = '/tournaments/import';

  @override
  State<TournamentImportPage> createState() => _TournamentImportPageState();
}

class _TournamentImportPageState extends State<TournamentImportPage> {
  final _services = AppServices.instance;
  late final TournamentImportService _importService =
      TournamentImportService(_services);
  static const _msgDecodeFailed = '\u0051\u0052\u306e\u8aad\u307f\u53d6\u308a\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002';

  bool _processing = false;

  Future<void> _handleBarcode(BarcodeCapture capture) async {
    if (_processing) return;

    final barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;

    final raw = barcodes.first.rawValue;
    if (raw == null || raw.isEmpty) return;

    setState(() => _processing = true);
    try {
      final result = await _importService.importFromQrRawValue(raw);
      if (result.success) {
        if (!mounted) return;
        Navigator.of(context).pop(true);
        return;
      }
      await _showError(result.message ?? _msgDecodeFailed);
    } finally {
      if (mounted) {
        setState(() => _processing = false);
      }
    }
  }

  Future<void> _showError(String message) async {
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('\u30a8\u30e9\u30fc'),
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
      appBar: AppBar(title: const Text('\u0051\u0052\u53d6\u8fbc')),
      body: Stack(
        children: [
          MobileScanner(onDetect: _handleBarcode),
          if (_processing) const Center(child: CircularProgressIndicator()),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../providers/controller_providers.dart';

class TournamentImportPage extends ConsumerStatefulWidget {
  const TournamentImportPage({super.key});

  static const String routeName = '/tournaments/import';

  @override
  ConsumerState<TournamentImportPage> createState() =>
      _TournamentImportPageState();
}

class _TournamentImportPageState extends ConsumerState<TournamentImportPage> {
  static const _msgDecodeFailed =
      '\u0051\u0052\u306e\u8aad\u307f\u53d6\u308a\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002';

  Future<void> _handleBarcode(BarcodeCapture capture) async {
    final processing = ref.read(tournamentImportControllerProvider);
    if (processing) return;

    final barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;

    final raw = barcodes.first.rawValue;
    if (raw == null || raw.isEmpty) return;

    final result = await ref
        .read(tournamentImportControllerProvider.notifier)
        .importFromQrRawValue(raw);
    if (result.success) {
      if (!mounted) return;
      Navigator.of(context).pop(true);
      return;
    }
    await _showError(result.message ?? _msgDecodeFailed);
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
    final processing = ref.watch(tournamentImportControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('\u0051\u0052\u53d6\u8fbc')),
      body: Stack(
        children: [
          MobileScanner(onDetect: _handleBarcode),
          if (processing) const Center(child: CircularProgressIndicator()),
        ],
      ),
    );
  }
}

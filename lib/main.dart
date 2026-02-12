import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

/// アプリのエントリーポイント。
///
/// Riverpod の依存解決を有効にするため、最上位を [ProviderScope] で包む。
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const ProviderScope(
      child: ScoreAttackApp(),
    ),
  );
}

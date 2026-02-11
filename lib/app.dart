import 'package:flutter/material.dart';

import 'core/constants.dart';
import 'ui/pages/home_page.dart';
import 'ui/pages/tournament_create_page.dart';
import 'ui/pages/tournament_detail_page.dart';
import 'ui/pages/tournament_import_page.dart';
import 'ui/pages/tournament_update_page.dart';
import 'ui/pages/evidence_register_page.dart';
import 'ui/pages/post_support_page.dart';
import 'ui/pages/settings_page.dart';

class ScoreAttackApp extends StatelessWidget {
  const ScoreAttackApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
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

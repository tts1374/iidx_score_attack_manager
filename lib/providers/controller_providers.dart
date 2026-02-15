import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../presentation/controllers/tournament_import_controller.dart';

/// QR取込画面の処理中状態を管理するController Provider。
final tournamentImportControllerProvider =
    NotifierProvider.autoDispose<TournamentImportController, bool>(
  TournamentImportController.new,
);

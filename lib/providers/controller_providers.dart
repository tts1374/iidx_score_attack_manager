import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../presentation/controllers/tournament_import_controller.dart';

final tournamentImportControllerProvider =
    NotifierProvider.autoDispose<TournamentImportController, bool>(
  TournamentImportController.new,
);

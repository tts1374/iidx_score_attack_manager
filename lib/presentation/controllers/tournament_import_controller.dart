import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/use_case_providers.dart';
import '../../services/tournament_import_service.dart';

class TournamentImportController extends AutoDisposeNotifier<bool> {
  @override
  bool build() {
    return false;
  }

  Future<TournamentImportResult> importFromQrRawValue(String rawValue) async {
    if (state) {
      return const TournamentImportResult.failure(
        '\u0051\u0052\u306e\u8aad\u307f\u53d6\u308a\u3092\u5b9f\u884c\u4e2d\u3067\u3059\u3002',
      );
    }

    state = true;
    try {
      return await ref
          .read(tournamentImportUseCaseProvider)
          .importFromQrRawValue(rawValue);
    } finally {
      state = false;
    }
  }
}

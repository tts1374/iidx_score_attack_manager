import 'package:flutter_test/flutter_test.dart';
import 'package:iidx_score_attack_manager/providers/data_source_providers.dart';

import '../test_helpers/provider_container_helper.dart';

void main() {
  group('QrService', () {
    test('encode/decodeで同一データを復元できる', () {
      final container = ProviderContainer.test();
      addTearDown(container.dispose);

      final service = container.read(qrServiceDataSourceProvider);
      final source = <String, dynamic>{
        'tournament_uuid': 'uuid-1',
        'tournament_name': 'test',
        'owner': 'owner',
        'hashtag': 'hash',
        'start_date': '2026-02-01',
        'end_date': '2026-02-28',
        'created_at': '2026-02-01T00:00:00Z',
        'charts': [
          {'music_id': 1, 'chart_id': 10, 'sort_order': 1},
        ],
      };

      final encoded = service.encodeTournament(source);
      final decoded = service.decodeTournament(encoded);

      expect(decoded, source);
    });

    test('不正payloadは例外になる', () {
      final container = ProviderContainer.test();
      addTearDown(container.dispose);

      final service = container.read(qrServiceDataSourceProvider);
      expect(
        () => service.decodeTournament('invalid'),
        throwsA(isA<FormatException>()),
      );
    });
  });
}

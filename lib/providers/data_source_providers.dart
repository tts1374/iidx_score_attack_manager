import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/db/app_database.dart';
import '../data/db/song_master_database.dart';
import '../services/post_image_service.dart';
import '../services/qr_from_image_service.dart';
import '../services/qr_service.dart';
import '../services/share_intent_service.dart';

final appDataSourceProvider = Provider<AppDatabase>((ref) {
  return AppDatabase.instance;
});

final songMasterDataSourceProvider = Provider<SongMasterDatabase>((ref) {
  return SongMasterDatabase.instance;
});

final qrServiceDataSourceProvider = Provider<QrService>((ref) {
  return QrService();
});

final postImageDataSourceProvider = Provider<PostImageService>((ref) {
  return PostImageService();
});

final shareIntentDataSourceProvider = Provider<ShareIntentService>((ref) {
  return ShareIntentService();
});

final qrFromImageDataSourceProvider = Provider<QrFromImageService>((ref) {
  return QrFromImageService();
});

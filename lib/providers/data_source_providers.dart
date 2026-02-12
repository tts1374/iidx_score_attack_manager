import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/db/app_database.dart';
import '../data/db/song_master_database.dart';
import '../services/post_image_service.dart';
import '../services/qr_from_image_service.dart';
import '../services/qr_service.dart';
import '../services/share_intent_service.dart';

/// `app_data.sqlite` のデータソースProvider。
final appDataSourceProvider = Provider<AppDatabase>((ref) {
  return AppDatabase.instance;
});

/// `song_master.sqlite` のデータソースProvider。
final songMasterDataSourceProvider = Provider<SongMasterDatabase>((ref) {
  return SongMasterDatabase.instance;
});

/// QRエンコード/デコードサービスProvider。
final qrServiceDataSourceProvider = Provider<QrService>((ref) {
  return QrService();
});

/// 投稿画像生成サービスProvider。
final postImageDataSourceProvider = Provider<PostImageService>((ref) {
  return PostImageService();
});

/// OS共有受信サービスProvider。
final shareIntentDataSourceProvider = Provider<ShareIntentService>((ref) {
  return ShareIntentService();
});

/// 画像からQRを抽出するサービスProvider。
final qrFromImageDataSourceProvider = Provider<QrFromImageService>((ref) {
  return QrFromImageService();
});

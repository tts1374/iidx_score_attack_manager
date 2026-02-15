import 'dart:convert';
import 'dart:io';

import '../core/constants.dart';

/// 大会情報のQRエンコード/デコードを担当するサービス。
class QrService {
  /// 大会データを `JSON -> gzip -> base64` に変換する。
  ///
  /// 生成バイトが上限を超える場合は [QrTooLargeException] を送出する。
  String encodeTournament(Map<String, dynamic> data) {
    final jsonBytes = utf8.encode(jsonEncode(data));
    final gzipped = GZipCodec().encode(jsonBytes);
    if (gzipped.length > qrMaxBytes) {
      throw const QrTooLargeException();
    }
    return base64Encode(gzipped);
  }

  /// QR文字列を `base64 -> gzip -> JSON` で復号する。
  ///
  /// 想定形式でない場合は [QrDecodeException] を送出する。
  Map<String, dynamic> decodeTournament(String payload) {
    final decoded = base64Decode(payload);
    final bytes = GZipCodec().decode(decoded);
    final jsonMap = jsonDecode(utf8.decode(bytes));
    if (jsonMap is! Map<String, dynamic>) {
      throw const QrDecodeException();
    }
    return jsonMap;
  }
}

/// QRデータサイズが上限を超えたことを示す例外。
class QrTooLargeException implements Exception {
  const QrTooLargeException();
}

/// QRデータの復号失敗を示す例外。
class QrDecodeException implements Exception {
  const QrDecodeException();
}

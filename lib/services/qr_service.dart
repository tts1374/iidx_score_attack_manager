import 'dart:convert';
import 'dart:io';

import '../core/constants.dart';

class QrService {
  String encodeTournament(Map<String, dynamic> data) {
    final jsonBytes = utf8.encode(jsonEncode(data));
    final gzipped = GZipCodec().encode(jsonBytes);
    if (gzipped.length > qrMaxBytes) {
      throw const QrTooLargeException();
    }
    return base64Encode(gzipped);
  }

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

class QrTooLargeException implements Exception {
  const QrTooLargeException();
}

class QrDecodeException implements Exception {
  const QrDecodeException();
}

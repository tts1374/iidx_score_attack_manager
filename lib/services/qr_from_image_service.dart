import 'package:google_mlkit_barcode_scanning/google_mlkit_barcode_scanning.dart';

/// 画像ファイルからQR文字列を抽出するサービス。
class QrFromImageService {
  /// 画像内の最初のQR `rawValue` を返す。未検出時は `null`。
  Future<String?> tryExtractQrRawValue(String imagePath) async {
    final inputImage = InputImage.fromFilePath(imagePath);
    final scanner = BarcodeScanner(
      formats: const [BarcodeFormat.qrCode],
    );

    try {
      final barcodes = await scanner.processImage(inputImage);
      for (final barcode in barcodes) {
        final raw = barcode.rawValue;
        if (raw != null && raw.isNotEmpty) {
          return raw;
        }
      }
      return null;
    } finally {
      scanner.close();
    }
  }
}

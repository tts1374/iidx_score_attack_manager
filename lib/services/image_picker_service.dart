import 'package:image_picker/image_picker.dart';

/// 画像選択プラグインのラッパー。
class ImagePickerService {
  final ImagePicker _picker = ImagePicker();

  /// 指定した [source] から画像1枚を選択する。
  Future<XFile?> pickImage({required ImageSource source}) {
    return _picker.pickImage(source: source);
  }
}


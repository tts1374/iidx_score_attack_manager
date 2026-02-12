import '../../domain/repositories/app_settings_repository.dart';

/// 設定値読み出しのユースケース。
class SettingsUseCase {
  SettingsUseCase(this._repository);

  final AppSettingsRepositoryContract _repository;

  /// 設定キーから値を取得する。
  Future<String?> getValue(String key) {
    return _repository.getValue(key);
  }
}

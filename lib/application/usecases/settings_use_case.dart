import '../../domain/repositories/app_settings_repository.dart';

class SettingsUseCase {
  SettingsUseCase(this._repository);

  final AppSettingsRepositoryContract _repository;

  Future<String?> getValue(String key) {
    return _repository.getValue(key);
  }
}

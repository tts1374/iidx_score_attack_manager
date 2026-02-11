class AppSetting {
  AppSetting({required this.key, required this.value});

  final String key;
  final String value;

  Map<String, Object?> toMap() {
    return {
      'key': key,
      'value': value,
    };
  }

  factory AppSetting.fromMap(Map<String, Object?> map) {
    return AppSetting(
      key: map['key'] as String,
      value: map['value'] as String,
    );
  }
}

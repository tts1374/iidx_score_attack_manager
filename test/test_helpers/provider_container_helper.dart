import 'package:flutter_riverpod/flutter_riverpod.dart' as rp;

/// flutter_riverpod 2.x で `ProviderContainer.test` 記法を使うためのラッパ。
class ProviderContainer {
  static rp.ProviderContainer test({
    rp.ProviderContainer? parent,
    List<rp.Override> overrides = const [],
    List<rp.ProviderObserver>? observers,
  }) {
    return rp.ProviderContainer(
      parent: parent,
      overrides: overrides,
      observers: observers,
    );
  }
}

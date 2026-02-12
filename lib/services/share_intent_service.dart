import 'dart:async';

import 'package:flutter_sharing_intent/flutter_sharing_intent.dart';
import 'package:flutter_sharing_intent/model/sharing_file.dart';

/// OS共有受信（起動時/起動後）を扱う薄いラッパー。
class ShareIntentService {
  /// 共有経由でアプリ起動した際の初期ファイル一覧を返す。
  Future<List<SharedFile>> getInitialFiles() {
    return FlutterSharingIntent.instance.getInitialSharing();
  }

  /// アプリ起動後に受信した共有ファイルストリームを返す。
  Stream<List<SharedFile>> mediaStream() {
    return FlutterSharingIntent.instance.getMediaStream();
  }

  /// 共有状態をリセットする。
  void reset() {
    FlutterSharingIntent.instance.reset();
  }
}

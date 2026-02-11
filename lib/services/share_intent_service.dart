import 'dart:async';

import 'package:flutter_sharing_intent/flutter_sharing_intent.dart';
import 'package:flutter_sharing_intent/model/sharing_file.dart';

class ShareIntentService {
  Future<List<SharedFile>> getInitialFiles() {
    return FlutterSharingIntent.instance.getInitialSharing();
  }

  Stream<List<SharedFile>> mediaStream() {
    return FlutterSharingIntent.instance.getMediaStream();
  }

  void reset() {
    FlutterSharingIntent.instance.reset();
  }
}

import '../data/models/evidence.dart';

/// 譜面の提出状態。
enum ChartSubmissionState {
  /// 未登録（エビデンスなし）
  unregistered,

  /// 登録済みだが投稿未反映
  pendingPost,

  /// 登録済みかつ投稿反映済み
  posted,
}

/// エビデンス1件から提出状態を判定する。
ChartSubmissionState resolveChartSubmissionState(Evidence? evidence) {
  if (evidence == null) {
    return ChartSubmissionState.unregistered;
  }
  if (evidence.postedFlagUpdate == 0) {
    return ChartSubmissionState.pendingPost;
  }
  return ChartSubmissionState.posted;
}

/// 投稿対象（更新あり）が1件以上あるかを返す。
bool hasPendingPostEvidence(Iterable<Evidence?> evidences) {
  for (final evidence in evidences) {
    if (resolveChartSubmissionState(evidence) == ChartSubmissionState.pendingPost) {
      return true;
    }
  }
  return false;
}


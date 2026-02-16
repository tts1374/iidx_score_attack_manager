export function buildEvidenceFileName(tournamentUuid: string, chartId: number): string {
  return `${tournamentUuid}_${chartId}.jpg`;
}

export type SubmissionState = 'unsubmitted' | 'submitted' | 'updated';

export function getSubmissionState(updateSeq: number, fileDeleted: boolean): SubmissionState {
  if (fileDeleted || updateSeq <= 0) {
    return 'unsubmitted';
  }
  if (updateSeq === 1) {
    return 'submitted';
  }
  return 'updated';
}


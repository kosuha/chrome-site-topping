import { getAllVersions, reconstructFromVersions } from './versioning';

export interface EditorCode {
  javascript: string;
  css: string;
}

export async function loadSiteHistoryHelper(siteCode: string) {
  const allVersions = await getAllVersions(siteCode);
  if (allVersions.length === 0) {
    return { steps: [], latest: { javascript: '', css: '' } as EditorCode };
  }
  const steps = reconstructFromVersions(allVersions);
  const latest = steps[steps.length - 1] || { javascript: '', css: '' };
  return { steps, latest } as { steps: EditorCode[]; latest: EditorCode };
}

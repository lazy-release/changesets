export interface ChangesetType {
  type: string;
  displayName: string;
  emoji: string;
  releaseType?: "major" | "minor" | "patch";
  promptBreakingChange?: boolean;
}

export interface ParserContext {
  selfContained: boolean;
  announcementCoinIds: Record<string, Uint8Array>;
  announcementPuzzleHashes: Record<string, Uint8Array>;
  announcementMessages: Record<string, Uint8Array>;
  coinAnnouncementAssertions: Set<string>;
  puzzleAnnouncementAssertions: Set<string>;
  spentCoinIds: Set<string>;
  spentPuzzleHashes: Set<string>;
  createdCoinIds: Set<string>;
  assertedCoinIds: Set<string>;
}

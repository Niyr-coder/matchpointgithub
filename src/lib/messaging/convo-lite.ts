export type ConvoMatchSummary = {
  status: string;
  playedAt: string;
  mode: "singles" | "doubles";
  opponentName: string | null;
  clubName: string | null;
  courtName: string | null;
};

export type ConvoLite = {
  id: string;
  name: string;
  kind: "dm" | "group" | "support" | "club_channel" | "team_channel" | "match";
  isGroup: boolean;
  isSystem: boolean;
  isOfficial: boolean;
  memberCount: number;
  lastBody: string | null;
  lastSenderId: string | null;
  lastAt: string | null;
  unreadCount: number;
  otherUserId: string | null;
  otherUsername: string | null;
  matchSummary: ConvoMatchSummary | null;
};

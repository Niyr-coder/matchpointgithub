export type ConvoMatchSummary = {
  status: string;
  playedAt: string;
  mode: "singles" | "doubles";
  opponentName: string | null;
  clubName: string | null;
  courtName: string | null;
};

export type ConvoQuedadaSummary = {
  status: string;
  startsAt: string | null;
  locationText: string | null;
};

export type ConvoLite = {
  id: string;
  name: string;
  kind:
    | "dm"
    | "group"
    | "support"
    | "club_channel"
    | "club_announcements"
    | "team_channel"
    | "match"
    | "quedada";
  isGroup: boolean;
  isSystem: boolean;
  isOfficial: boolean;
  /** Canal broadcast del club (solo lectura para no-staff). */
  isBroadcast: boolean;
  clubId: string | null;
  memberCount: number;
  lastBody: string | null;
  lastSenderId: string | null;
  lastAt: string | null;
  unreadCount: number;
  otherUserId: string | null;
  otherUsername: string | null;
  matchSummary: ConvoMatchSummary | null;
  quedadaSummary: ConvoQuedadaSummary | null;
};

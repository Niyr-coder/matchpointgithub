/** Tipos de perfil compartidos — sin "use client" para loaders server-only. */

export type ProfileClub = {
  id: string;
  name: string;
  city: string;
  role: string;
  since: string;
};

export type ProfileMatch = {
  id: string;
  playedAt: string;
  sport: string;
  mode: string;
  clubName: string | null;
  result: "win" | "loss";
  sets: [number, number][];
  oppName: string;
  oppAvatarUrl: string | null;
  ratingDelta: number | null;
};

export type ModeRating = {
  currentRating: number;
  matchesTotal: number;
  wins: number;
  losses: number;
  rank: number | null;
};

export type RatingSnapshotPoint = { rating: number; snapshotAt: string };

export type CoachShotInsight = { label: string; winPct: number };

export type ProfileUpcomingItem = {
  id: string;
  dateLabel: string;
  club: string;
  type: string;
};

export type ProfileFriendPreviewMember = {
  initials: string;
  tone: string;
  avatarUrl: string | null;
};

export type ProfileFriendPreview = {
  count: number;
  members: ProfileFriendPreviewMember[];
};

export type EditableProfile = {
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  birthdate: string | null;
  phone: string | null;
  dominantHand: "left" | "right" | null;
  preferredSport: "tennis" | "padel" | "pickleball" | null;
  skillLevel: "beginner" | "intermediate" | "advanced" | "pro" | null;
  locale: "es" | "en" | "pt" | null;
};

export type ProfileData = {
  meUserId: string | null;
  name: string;
  username: string;
  isPremium: boolean;
  city: string | null;
  country: string | null;
  bio: string | null;
  avatarUrl: string | null;
  primaryClub: { id: string; name: string; city: string } | null;
  clubs: ProfileClub[];
  memberSince: string;
  currentRating: number;
  rank: number | null;
  matchesTotal: number;
  wins: number;
  losses: number;
  ratings: { singles: ModeRating | null; doubles: ModeRating | null };
  ratingSnapshotsByMode: { singles: RatingSnapshotPoint[]; doubles: RatingSnapshotPoint[] };
  coachShotInsights: CoachShotInsight[];
  matchHistory: ProfileMatch[];
  analyticsUpdatedAt: string | null;
  matchHistoryCap?: number | null;
  badges?: Array<{ kind: string; label: string; icon: string; description: string | null; on: boolean }>;
  editable?: EditableProfile | null;
  upcoming?: ProfileUpcomingItem[];
  friendsPreview?: ProfileFriendPreview | null;
};

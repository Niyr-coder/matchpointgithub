// Tipo compartido cliente/servidor para el panel de detalle en admin-users.
export type AdminUserEditableProfile = {
  displayName: string;
  username: string;
  city: string;
  bio: string | null;
  phone: string | null;
  country: string | null;
  skillLevel: string | null;
  preferredSport: string | null;
};

export type AdminProfileFieldChange = {
  key: string;
  label: string;
  before: string;
  after: string;
};

export type AdminProfileChangeEntry = {
  at: string;
  action: string;
  fields: AdminProfileFieldChange[];
};

export type AdminEloPoint = {
  at: string;
  mode: string;
  rating: number;
  delta: number | null;
};

export type AdminIntegritySignal = {
  code: string;
  label: string;
  severity: "info" | "warn" | "critical";
  detail: string;
};

export type AdminUserReport = {
  id: string;
  status: string;
  reason: string;
  details: string | null;
  createdAt: string;
  reporterName: string;
};

export type AdminUserDetail = {
  email: string | null;
  lastSignInAt: string | null;
  bio: string | null;
  country: string | null;
  phone: string | null;
  phoneVerified: boolean;
  locale: string;
  preferredSport: string | null;
  skillLevel: string | null;
  createdAt: string;
  onboardedAt: string | null;
  isSystem: boolean;
  editable: AdminUserEditableProfile;
  roles: { role: string; clubName: string | null; grantedAt: string }[];
  sportStats: {
    mode: string;
    rating: number;
    matches: number;
    wins: number;
    losses: number;
  }[];
  ranks: { mode: string; rank: number }[];
  spendLifetimeCents: number;
  txnCountMonth: number;
  lastTxnAt: string | null;
  friendsCount: number;
  clubMemberships: { clubName: string; status: string }[];
  openReportsCount: number;
  suspensionCount: number;
  lastMatchAt: string | null;
  mpSubscription: {
    status: string;
    createdAt: string;
    expiresAt: string | null;
    source: "comprobante" | "admin" | "desconocido";
  } | null;
  recentAudit: { action: string; entity: string; at: string }[];
  profileChanges: AdminProfileChangeEntry[];
  eloHistory: AdminEloPoint[];
  integritySignals: AdminIntegritySignal[];
  reports: AdminUserReport[];
};

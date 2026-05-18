// Club schemas: public list, public detail, owner update.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  IsoDateTimeSchema,
  MpCurrencySchema,
  MpSportSchema,
  SlugSchema,
  UuidSchema,
} from "./common";

extendZodWithOpenApi(z);

export const ClubStatusSchema = z
  .enum(["pending", "active", "suspended", "archived"])
  .openapi("ClubStatus");

export const ClubSchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    name: z.string(),
    description: z.string().nullable(),
    logoUrl: z.string().url().nullable(),
    coverUrl: z.string().url().nullable(),
    country: z.string(),
    city: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().email().nullable(),
    timezone: z.string(),
    currency: MpCurrencySchema,
    sports: z.array(MpSportSchema),
    status: ClubStatusSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    version: z.number().int(),
  })
  .openapi("Club");

export const ClubSettingsSchema = z
  .object({
    reservationWindowDays: z.number().int(),
    cancellationWindowHours: z.number().int(),
    defaultSlotMinutes: z.number().int(),
    allowWalkins: z.boolean(),
    chargeNoShowPct: z.number().int(),
    openHours: z.record(z.string(), z.unknown()),
  })
  .openapi("ClubSettings");

export const ClubPhotoSchema = z
  .object({
    id: UuidSchema,
    url: z.string(),
    caption: z.string().nullable(),
    ordinal: z.number().int(),
  })
  .openapi("ClubPhoto");

export const ClubDetailSchema = z
  .object({
    club: ClubSchema,
    settings: ClubSettingsSchema.nullable(),
    amenities: z.array(z.string()),
    photos: z.array(ClubPhotoSchema),
  })
  .openapi("ClubDetail");

export const ClubListParamsSchema = z
  .object({
    q: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    sport: MpSportSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .openapi("ClubListParams");

export const ClubUpdateSchema = z
  .object({
    name: z.string().min(2).max(120),
    description: z.string().nullable(),
    logoUrl: z.string().url().nullable(),
    coverUrl: z.string().url().nullable(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().email().nullable(),
    sports: z.array(MpSportSchema).min(1),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    expectedVersion: z.number().int(),
  })
  .partial({
    name: true,
    description: true,
    logoUrl: true,
    coverUrl: true,
    address: true,
    phone: true,
    email: true,
    sports: true,
    latitude: true,
    longitude: true,
  })
  .openapi("ClubUpdate");

export const ClubFeaturedSchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    name: z.string(),
    city: z.string(),
    coverUrl: z.string().url().nullable(),
    sports: z.array(MpSportSchema),
    currency: MpCurrencySchema,
    courtsCount: z.number().int(),
    minPriceCents: z.number().int().nullable(),
    // Snippet + dirección para mostrar en la card pública (el detalle entero
    // ahora vive detrás del gate de auth en /clubes/[slug]). Description la
    // truncamos en el view a ~120 chars.
    description: z.string().nullable(),
    address: z.string().nullable(),
    // null = club no pagó featuring; ISO string si está activo (futuro).
    // En lectura: si <= now(), tratar como null (expirado).
    featuredUntil: z.string().datetime({ offset: true }).nullable(),
    // Horario de hoy formateado "HH:MM — HH:MM" o null si no hay datos /
    // si el club marca el día como cerrado. Se calcula server-side desde
    // club_settings.open_hours.
    openHoursToday: z.string().nullable(),
    // true si ahora mismo el club está dentro de su horario de hoy.
    // Computado contra hora de Ecuador (UTC-5).
    isOpenNow: z.boolean(),
  })
  .openapi("ClubFeatured");

// ── reviews ─────────────────────────────────────────────────────────────
export const ClubReviewSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema,
    userId: UuidSchema,
    userDisplayName: z.string(),
    userAvatarUrl: z.string().url().nullable(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("ClubReview");

export const ClubReviewCreateSchema = z
  .object({
    clubId: UuidSchema,
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(4).max(2000).optional(),
  })
  .openapi("ClubReviewCreate");

export const ClubReviewStatsSchema = z
  .object({
    avgRating: z.number(),
    reviewsCount: z.number().int(),
  })
  .openapi("ClubReviewStats");

// ── Social view del club (vivido dentro del dashboard) ─────────────────
const ClubSocialMemberSchema = z.object({
  userId: UuidSchema,
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  city: z.string().nullable(),
  matchesAtClub: z.number().int(),
  lastPlayedAt: z.string().nullable(),
  isFriend: z.boolean(),
});

const ClubSocialTournamentSchema = z.object({
  id: UuidSchema,
  slug: z.string(),
  name: z.string(),
  sport: z.string(),
  startsAt: z.string(),
  status: z.string(),
  maxParticipants: z.number().int().nullable(),
  entryFeeCents: z.number().int().nullable(),
});

const ClubSocialActivitySchema = z.object({
  id: z.string(),
  kind: z.enum(["tournament_published", "match_played", "reservation_created"]),
  at: z.string(),
  title: z.string(),
  sub: z.string().nullable(),
  actorName: z.string().nullable(),
  actorAvatar: z.string().url().nullable(),
  thumbnailUrl: z.string().url().nullable(),
  linkHref: z.string().nullable(),
});

const ClubSocialPhotoSchema = z.object({
  id: UuidSchema,
  url: z.string().url(),
  caption: z.string().nullable(),
});

const ClubSocialReviewSchema = z.object({
  id: UuidSchema,
  userDisplayName: z.string(),
  userAvatarUrl: z.string().url().nullable(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string(),
});

export const ClubSocialViewSchema = z.object({
  club: z.object({
    id: UuidSchema,
    slug: z.string(),
    name: z.string(),
    city: z.string(),
    country: z.string(),
    sports: z.array(z.string()),
    coverUrl: z.string().url().nullable(),
    description: z.string().nullable(),
    address: z.string().nullable(),
    courtsCount: z.number().int(),
    openHoursToday: z.string().nullable(),
    isOpenNow: z.boolean(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  }),
  stats: z.object({
    rating: z.number().nullable(),
    reviewsCount: z.number().int(),
    followersCount: z.number().int(),
    matchesLast30d: z.number().int(),
  }),
  isFollowing: z.boolean(),
  // Rol del visitante en relación a este club. Determina afordancias
  // administrativas en el view (edit / volver al panel).
  viewerRole: z.enum(["owner", "manager", "admin", "guest"]),
  upcomingTournaments: z.array(ClubSocialTournamentSchema),
  frequentMembers: z.array(ClubSocialMemberSchema),
  friendsHere: z.array(ClubSocialMemberSchema),
  activity: z.array(ClubSocialActivitySchema),
  photos: z.array(ClubSocialPhotoSchema),
  reviews: z.array(ClubSocialReviewSchema),
});

export type ClubSocialMember = z.infer<typeof ClubSocialMemberSchema>;
export type ClubSocialTournament = z.infer<typeof ClubSocialTournamentSchema>;
export type ClubSocialActivity = z.infer<typeof ClubSocialActivitySchema>;
export type ClubSocialPhoto = z.infer<typeof ClubSocialPhotoSchema>;
export type ClubSocialReview = z.infer<typeof ClubSocialReviewSchema>;
export type ClubSocialView = z.infer<typeof ClubSocialViewSchema>;

export type Club = z.infer<typeof ClubSchema>;
export type ClubDetail = z.infer<typeof ClubDetailSchema>;
export type ClubUpdate = z.infer<typeof ClubUpdateSchema>;
export type ClubListParams = z.infer<typeof ClubListParamsSchema>;
export type ClubFeatured = z.infer<typeof ClubFeaturedSchema>;
export type ClubReview = z.infer<typeof ClubReviewSchema>;
export type ClubReviewStats = z.infer<typeof ClubReviewStatsSchema>;

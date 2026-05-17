// Supabase Storage bucket catalog. See docs/architecture/00-overview.md §12.
export const STORAGE_BUCKETS = {
  AVATARS: "avatars",
  CLUB_COVERS: "club-covers",
  CLUB_COURTS: "club-courts",
  RESOURCES: "resources",
  TICKETS_ATTACHMENTS: "tickets-attachments",
  KYC_DOCS: "kyc-docs",
  PAYMENT_PROOFS: "payment_proofs",
} as const;

export type BucketName = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

// Per-bucket upload limits enforced in Server Actions (Storage RLS is enforced separately).
export const UPLOAD_LIMITS: Record<BucketName, { maxBytes: number; mimePrefix: string[] }> = {
  [STORAGE_BUCKETS.AVATARS]: { maxBytes: 2 * 1024 * 1024, mimePrefix: ["image/"] },
  [STORAGE_BUCKETS.CLUB_COVERS]: { maxBytes: 8 * 1024 * 1024, mimePrefix: ["image/"] },
  [STORAGE_BUCKETS.CLUB_COURTS]: { maxBytes: 8 * 1024 * 1024, mimePrefix: ["image/"] },
  [STORAGE_BUCKETS.RESOURCES]: { maxBytes: 50 * 1024 * 1024, mimePrefix: ["video/", "image/", "application/pdf"] },
  [STORAGE_BUCKETS.TICKETS_ATTACHMENTS]: { maxBytes: 10 * 1024 * 1024, mimePrefix: ["image/", "application/pdf"] },
  [STORAGE_BUCKETS.KYC_DOCS]: { maxBytes: 10 * 1024 * 1024, mimePrefix: ["application/pdf", "image/"] },
  [STORAGE_BUCKETS.PAYMENT_PROOFS]: { maxBytes: 8 * 1024 * 1024, mimePrefix: ["image/", "application/pdf"] },
};

export function assertUpload(bucket: BucketName, mime: string, size: number) {
  const limit = UPLOAD_LIMITS[bucket];
  if (size > limit.maxBytes) {
    throw new Error(
      `File too large (${(size / 1024 / 1024).toFixed(1)} MB, max ${limit.maxBytes / 1024 / 1024} MB)`,
    );
  }
  if (!limit.mimePrefix.some((p) => mime.startsWith(p))) {
    throw new Error(`Unsupported file type ${mime}`);
  }
}

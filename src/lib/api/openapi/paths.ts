// Aggregator: import every route.openapi.ts so each registerPath() runs.
// Add a new line here whenever a new endpoint comes online.
//
// Keeping this manual (vs glob) means the build is deterministic and
// trivially debuggable. Forgetting to add a route here = its path won't
// show up in /docs, which is a loud-enough signal.

import "@/app/api/v1/auth/sign-up/route.openapi";
import "@/app/api/v1/auth/sign-in/route.openapi";
import "@/app/api/v1/auth/sign-out/route.openapi";
import "@/app/api/v1/auth/switch-role/route.openapi";
import "@/app/api/v1/me/route.openapi";
import "@/app/api/v1/me/club-application/route.openapi";
import "@/app/api/v1/club-applications/route.openapi";
import "@/app/api/v1/club-applications/[id]/route.openapi";
import "@/app/api/v1/club-applications/[id]/courts/route.openapi";
import "@/app/api/v1/club-applications/[id]/courts/[courtId]/route.openapi";
import "@/app/api/v1/club-applications/[id]/submit/route.openapi";
import "@/app/api/v1/admin/club-applications/admin.openapi";
import "@/app/api/v1/clubs/route.openapi";
import "@/app/api/v1/clubs/[idOrSlug]/route.openapi";
import "@/app/api/v1/clubs/[idOrSlug]/courts/route.openapi";
import "@/app/api/v1/courts/route.openapi";
import "@/app/api/v1/courts/[id]/route.openapi";
import "@/app/api/v1/reservations/route.openapi";
import "@/app/api/v1/reservations/[id]/route.openapi";
import "@/app/api/v1/reservations/[id]/cancel/route.openapi";
import "@/app/api/v1/walkins/route.openapi";
import "@/app/api/v1/cash/sessions/route.openapi";
import "@/app/api/v1/cash/sessions/[id]/close/route.openapi";
import "@/app/api/v1/transactions/route.openapi";
import "@/app/api/v1/products/route.openapi";
import "@/app/api/v1/products/[id]/route.openapi";
import "@/app/api/v1/sales/route.openapi";
import "@/app/api/v1/_openapi/coach-bundle.openapi";
import "@/app/api/v1/_openapi/social-bundle.openapi";
import "@/app/api/v1/_openapi/competitive-bundle.openapi";
import "@/app/api/v1/_openapi/cross-bundle.openapi";

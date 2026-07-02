"use server";

// Class catalog + enrollments. Charging for paid classes is deferred (would call
// createTransaction in the same flow once the UI exposes a payment-method picker).
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  ClassDetailSchema,
  ClassEnrollmentSchema,
  ClassListParamsSchema,
  ClassSchema,
  ClassSessionSchema,
  type ClassDetail,
  type ClassEnrollment,
  type ClassRow,
} from "@/lib/schemas/classes";
import { UuidSchema } from "@/lib/schemas/common";

function mapClass(row: Record<string, unknown>): ClassRow {
  return ClassSchema.parse({
    id: row.id,
    clubId: row.club_id,
    coachId: row.coach_id,
    name: row.name,
    description: row.description ?? null,
    kind: row.kind,
    sport: row.sport,
    skillLevel: row.skill_level ?? null,
    maxStudents: row.max_students,
    priceCents: row.price_cents,
    currency: row.currency,
    recurrenceRule: row.recurrence_rule ?? null,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function parseRange(range: string): { startsAt: string; endsAt: string } {
  const m = /^[\[(]([^,]+),([^)\]]+)[\)\]]$/.exec(range);
  if (!m) throw new Error(`bad tstzrange ${range}`);
  return { startsAt: new Date(m[1]).toISOString(), endsAt: new Date(m[2]).toISOString() };
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

// ── listClasses (public) ───────────────────────────────────────────────
export async function listClasses(input: unknown): Promise<ActionResult<ClassRow[]>> {
  return runAction(ClassListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;
    let q = supabase
      .from("classes")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (params.activeOnly) q = q.eq("active", true);
    if (params.clubId) q = q.eq("club_id", params.clubId);
    if (params.coachId) q = q.eq("coach_id", params.coachId);
    if (params.sport) q = q.eq("sport", params.sport);
    const { data, error } = await q;
    if (error) throw new MpError("CLASSES.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapClass);
  });
}

// ── getClass (public, with upcoming sessions + enrollment count) ───────
export async function getClass(input: unknown): Promise<ActionResult<ClassDetail>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const [{ data: cls, error }, { data: sessions }, { count }] = await Promise.all([
      supabase.from("classes").select("*").eq("id", id).single(),
      supabase
        .from("class_sessions")
        .select("*")
        .eq("class_id", id)
        .order("during")
        .limit(10),
      supabase
        .from("class_enrollments")
        .select("*", { count: "exact", head: true })
        .eq("class_id", id)
        .eq("status", "enrolled"),
    ]);
    if (error || !cls) throw new MpError("CLASSES.NOT_FOUND", "Class not found", 404);
    const detail: ClassDetail = {
      cls: mapClass(cls),
      sessions: (sessions ?? []).map((s) => {
        const r = parseRange(s.during as string);
        return ClassSessionSchema.parse({
          id: s.id,
          classId: s.class_id,
          courtId: (s.court_id as string | null) ?? null,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          status: s.status,
          notes: s.notes ?? null,
        });
      }),
      enrolledCount: count ?? 0,
    };
    return ClassDetailSchema.parse(detail);
  });
}

// ── listMyClasses (current user's enrollments) ─────────────────────────
export async function listMyClasses(): Promise<ActionResult<ClassEnrollment[]>> {
  return runAction(z.undefined(), undefined, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("class_enrollments")
      .select("*")
      .eq("student_id", userId)
      .order("enrolled_at", { ascending: false });
    if (error) throw new MpError("CLASSES.DB_ERROR", error.message, 500);
    return (data ?? []).map((r) =>
      ClassEnrollmentSchema.parse({
        id: r.id,
        classId: r.class_id,
        studentId: r.student_id,
        status: r.status,
        enrolledAt: r.enrolled_at,
      }),
    );
  });
}

// ── enrollInClass ──────────────────────────────────────────────────────
const EnrollSchema = z.object({
  classId: UuidSchema,
  studentId: UuidSchema.optional(), // coaches can enroll on behalf
});

export async function enrollInClass(input: unknown): Promise<ActionResult<ClassEnrollment>> {
  return runAction(EnrollSchema, input, async (data) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: cls, error: cErr } = await supabase
      .from("classes")
      .select("max_students,active,coach_id")
      .eq("id", data.classId)
      .single();
    if (cErr || !cls) throw new MpError("CLASSES.NOT_FOUND", "Class not found", 404);
    if (!cls.active) throw new MpError("CLASSES.INACTIVE", "Class is inactive", 422);

    // If a studentId is passed, must be the coach acting on behalf.
    const studentId = data.studentId ?? userId;
    if (studentId !== userId && cls.coach_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the coach can enroll someone else");
    }

    // Capacity check: how many active enrolled?
    const { count } = await supabase
      .from("class_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("class_id", data.classId)
      .eq("status", "enrolled");

    const status = (count ?? 0) >= (cls.max_students as number) ? "waitlist" : "enrolled";

    // Re-inscripción: el unique(class_id, student_id) + soft-cancel bloqueaba
    // volver a inscribirse para siempre ("already enrolled" eterno). Si hay
    // una fila 'cancelled', se revive en lugar de insertar.
    const { data: existing } = await supabase
      .from("class_enrollments")
      .select("id,status")
      .eq("class_id", data.classId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (existing && existing.status !== "cancelled") {
      throw new MpError("CLASSES.ALREADY_ENROLLED", "Already enrolled in this class", 409);
    }

    const { data: row, error } = existing
      ? await supabase
          .from("class_enrollments")
          .update({ status } as never)
          .eq("id", existing.id)
          .select()
          .single()
      : await supabase
          .from("class_enrollments")
          .insert({
            class_id: data.classId,
            student_id: studentId,
            status,
          } as never)
          .select()
          .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("CLASSES.ALREADY_ENROLLED", "Already enrolled in this class", 409);
      }
      throw new MpError("CLASSES.ENROLL_FAILED", error.message, 500);
    }
    return ClassEnrollmentSchema.parse({
      id: row.id,
      classId: row.class_id,
      studentId: row.student_id,
      status: row.status,
      enrolledAt: row.enrolled_at,
    });
  });
}

// ── createClass (coach acts on a club they teach at) ──────────────────
const CreateClassSchema = z.object({
  clubId: UuidSchema,
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  kind: z.enum(["group", "clinic", "camp", "one_on_one", "semi_private"]),
  sport: z.enum(["pickleball", "padel", "tenis"]),
  skillLevel: z.string().optional(),
  maxStudents: z.number().int().positive().default(8),
  priceCents: z.number().int().min(0).default(0),
  currency: z.string().default("USD"),
  recurrenceRule: z.string().optional(),
});

export async function createClass(input: unknown): Promise<ActionResult<ClassRow>> {
  return runAction(CreateClassSchema, input, async (data) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: link } = await supabase
      .from("coach_clubs")
      .select("coach_id")
      .eq("club_id", data.clubId)
      .eq("coach_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (!link) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Coach not active at this club");
    }
    const { data: row, error } = await supabase
      .from("classes")
      .insert({
        club_id: data.clubId,
        coach_id: userId,
        name: data.name,
        description: data.description ?? null,
        kind: data.kind,
        sport: data.sport,
        skill_level: data.skillLevel ?? null,
        max_students: data.maxStudents,
        price_cents: data.priceCents,
        currency: data.currency,
        recurrence_rule: data.recurrenceRule ?? null,
        active: true,
      } as never)
      .select()
      .single();
    if (error) throw new MpError("CLASSES.CREATE_FAILED", error.message, 500);
    return mapClass(row);
  });
}

// ── markAttendance (coach) ─────────────────────────────────────────────
const AttendanceSchema = z.object({
  classSessionId: UuidSchema,
  studentId: UuidSchema,
  attended: z.boolean(),
});

export async function markAttendance(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(AttendanceSchema, input, async (data) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    // Validate the coach owns the class behind the session.
    const { data: sess } = await supabase
      .from("class_sessions")
      .select("class_id")
      .eq("id", data.classSessionId)
      .single();
    if (!sess) throw new MpError("CLASSES.NOT_FOUND", "Session not found", 404);
    const { data: cls } = await supabase
      .from("classes")
      .select("coach_id")
      .eq("id", sess.class_id as string)
      .single();
    if (!cls || cls.coach_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the class coach can mark attendance");
    }
    const { error } = await supabase
      .from("class_session_attendance")
      .upsert(
        {
          class_session_id: data.classSessionId,
          student_id: data.studentId,
          attended: data.attended,
          arrived_at: data.attended ? new Date().toISOString() : null,
        } as never,
        { onConflict: "class_session_id,student_id" },
      );
    if (error) throw new MpError("CLASSES.ATTENDANCE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── cancelEnrollment ────────────────────────────────────────────────────
const CancelSchema = z.object({ enrollmentId: UuidSchema });

export async function cancelEnrollment(input: unknown): Promise<ActionResult<ClassEnrollment>> {
  return runAction(CancelSchema, input, async ({ enrollmentId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: existing, error: fErr } = await supabase
      .from("class_enrollments")
      .select("id,student_id,status,class_id,enrolled_at")
      .eq("id", enrollmentId)
      .single();
    if (fErr || !existing) {
      throw new MpError("ENROLLMENT.NOT_FOUND", "Enrollment not found", 404);
    }
    if ((existing.student_id as string) !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the student can cancel their enrollment");
    }
    if (existing.status === "cancelled" || existing.status === "completed") {
      throw new MpError(
        "ENROLLMENT.NOT_CANCELLABLE",
        `Enrollment is ${existing.status as string}`,
        409,
      );
    }

    const { data: row, error } = await supabase
      .from("class_enrollments")
      .update({ status: "cancelled" } as never)
      .eq("id", enrollmentId)
      .select()
      .single();
    if (error) throw new MpError("ENROLLMENT.CANCEL_FAILED", error.message, 500);

    return ClassEnrollmentSchema.parse({
      id: row.id,
      classId: row.class_id,
      studentId: row.student_id,
      status: row.status,
      enrolledAt: row.enrolled_at,
    });
  });
}

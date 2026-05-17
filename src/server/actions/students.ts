"use server";

// Student progress + evaluations from the coach's perspective.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  EvaluationCreateSchema,
  ProgressUpdateSchema,
  StudentEvaluationSchema,
  StudentProgressSchema,
  StudentSummarySchema,
} from "@/lib/schemas/students";

async function requireCoachId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data: coach } = await supabase
    .from("coach_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!coach) throw new AuthError("AUTH.ROLE_REQUIRED", "Coach profile required");
  return user.id;
}

// ── listMyStudents ─────────────────────────────────────────────────────
// "My students" = anyone enrolled in any class taught by the coach,
// plus anyone with a 1-on-1 lesson, plus anyone with existing progress notes.
export async function listMyStudents(): Promise<
  ActionResult<z.infer<typeof StudentSummarySchema>[]>
> {
  return runAction(z.undefined(), undefined, async () => {
    const coachId = await requireCoachId();
    const supabase = await getServerClient();

    const { data: classRows } = await supabase
      .from("classes")
      .select("id")
      .eq("coach_id", coachId);
    const classIds = (classRows ?? []).map((c) => c.id as string);

    const studentSet = new Set<string>();
    if (classIds.length) {
      const { data: enrollments } = await supabase
        .from("class_enrollments")
        .select("student_id")
        .in("class_id", classIds)
        .eq("status", "enrolled");
      for (const e of enrollments ?? []) studentSet.add(e.student_id as string);
    }
    const { data: lessons } = await supabase
      .from("lessons_1on1")
      .select("student_id")
      .eq("coach_id", coachId);
    for (const l of lessons ?? []) studentSet.add(l.student_id as string);
    const { data: progressOwners } = await supabase
      .from("student_progress")
      .select("student_id")
      .eq("coach_id", coachId);
    for (const p of progressOwners ?? []) studentSet.add(p.student_id as string);

    const studentIds = Array.from(studentSet);
    if (studentIds.length === 0) return [];

    const [{ data: identities }, { data: progress }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", studentIds),
      supabase
        .from("student_progress")
        .select("*")
        .in("student_id", studentIds)
        .eq("coach_id", coachId),
    ]);
    const identMap = new Map((identities ?? []).map((i) => [i.id as string, i]));
    const progressByStudent = new Map<string, z.infer<typeof StudentProgressSchema>[]>();
    for (const p of progress ?? []) {
      const list = progressByStudent.get(p.student_id as string) ?? [];
      list.push(
        StudentProgressSchema.parse({
          id: p.id,
          studentId: p.student_id,
          coachId: p.coach_id,
          skill: p.skill,
          currentLevel: p.current_level,
          targetLevel: p.target_level ?? null,
          updatedAt: p.updated_at,
        }),
      );
      progressByStudent.set(p.student_id as string, list);
    }

    return studentIds.map((id) =>
      StudentSummarySchema.parse({
        studentId: id,
        displayName: identMap.get(id)?.display_name ?? "—",
        avatarUrl: (identMap.get(id)?.avatar_url as string | null) ?? null,
        progress: progressByStudent.get(id) ?? [],
      }),
    );
  });
}

// ── updateStudentProgress (upsert by student×coach×skill) ──────────────
export async function updateStudentProgress(
  input: unknown,
): Promise<ActionResult<z.infer<typeof StudentProgressSchema>>> {
  return runAction(ProgressUpdateSchema, input, async (data) => {
    const coachId = await requireCoachId();
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("student_progress")
      .upsert(
        {
          student_id: data.studentId,
          coach_id: coachId,
          skill: data.skill,
          current_level: data.currentLevel,
          target_level: data.targetLevel ?? null,
        } as never,
        { onConflict: "student_id,coach_id,skill" },
      )
      .select()
      .single();
    if (error) throw new MpError("STUDENTS.PROGRESS_FAILED", error.message, 500);
    return StudentProgressSchema.parse({
      id: row.id,
      studentId: row.student_id,
      coachId: row.coach_id,
      skill: row.skill,
      currentLevel: row.current_level,
      targetLevel: row.target_level ?? null,
      updatedAt: row.updated_at,
    });
  });
}

// ── addEvaluation ──────────────────────────────────────────────────────
export async function addEvaluation(
  input: unknown,
): Promise<ActionResult<z.infer<typeof StudentEvaluationSchema>>> {
  return runAction(EvaluationCreateSchema, input, async (data) => {
    const coachId = await requireCoachId();
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("student_evaluations")
      .insert({
        student_id: data.studentId,
        coach_id: coachId,
        class_session_id: data.classSessionId ?? null,
        scores: data.scores,
        summary: data.summary ?? null,
      } as never)
      .select()
      .single();
    if (error) throw new MpError("STUDENTS.EVAL_FAILED", error.message, 500);
    return StudentEvaluationSchema.parse({
      id: row.id,
      studentId: row.student_id,
      coachId: row.coach_id,
      classSessionId: row.class_session_id ?? null,
      scores: (row.scores ?? {}) as Record<string, unknown>,
      summary: row.summary ?? null,
      createdAt: row.created_at,
    });
  });
}

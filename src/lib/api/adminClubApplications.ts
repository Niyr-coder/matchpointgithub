import type { ActionResult } from "@/lib/api/action";
import type { ClubApplication } from "@/lib/schemas/clubApplications";

function invalidResponse(status: number, body: string): ActionResult<never> {
  const snippet = body.trim().slice(0, 120);
  return {
    ok: false,
    error: {
      code: "INTERNAL.UNEXPECTED",
      message: snippet
        ? `Respuesta inválida del servidor (${status}): ${snippet}`
        : `Respuesta inválida del servidor (${status}).`,
      requestId: "",
    },
  };
}

async function postTransition<T>(
  url: string,
  body?: Record<string, unknown>,
): Promise<ActionResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    if (!text) return invalidResponse(res.status, "");

    let json: ActionResult<T>;
    try {
      json = JSON.parse(text) as ActionResult<T>;
    } catch {
      return invalidResponse(res.status, text);
    }

    if (!json || typeof json !== "object" || !("ok" in json)) {
      return invalidResponse(res.status, text);
    }
    return json;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "NETWORK.ERROR",
        message:
          err instanceof Error ? err.message : "No se pudo conectar con el servidor.",
        requestId: "",
      },
    };
  }
}

function transitionsBase(applicationId: string) {
  return `/api/v1/admin/club-applications/${applicationId}`;
}

export const adminClubAppApi = {
  startDocsReview(applicationId: string) {
    return postTransition<ClubApplication>(
      `${transitionsBase(applicationId)}/transitions/docs-review`,
    );
  },

  scheduleFieldVerification(
    applicationId: string,
    scheduledAt: string,
    notes?: string,
  ) {
    return postTransition<ClubApplication>(
      `${transitionsBase(applicationId)}/transitions/field-verification`,
      { scheduledAt, notes },
    );
  },

  markFieldVerified(applicationId: string, notes?: string) {
    return postTransition<ClubApplication>(
      `${transitionsBase(applicationId)}/transitions/field-verified`,
      { notes },
    );
  },

  startFinalReview(applicationId: string) {
    return postTransition<ClubApplication>(
      `${transitionsBase(applicationId)}/transitions/final-review`,
    );
  },

  approve(applicationId: string) {
    return postTransition<{ application: ClubApplication; clubId: string }>(
      `${transitionsBase(applicationId)}/transitions/approve`,
    );
  },

  quickApprove(applicationId: string) {
    return postTransition<{ application: ClubApplication; clubId: string }>(
      `${transitionsBase(applicationId)}/transitions/quick-approve`,
    );
  },

  reject(applicationId: string, reason: string) {
    return postTransition<ClubApplication>(
      `${transitionsBase(applicationId)}/transitions/reject`,
      { reason },
    );
  },

  addNote(applicationId: string, note: string) {
    return postTransition<{ ok: true }>(`${transitionsBase(applicationId)}/notes`, {
      note,
    });
  },

  approveDocument(applicationId: string, documentId: string) {
    return postTransition<{ id: string; status: "approved" }>(
      `${transitionsBase(applicationId)}/documents/${documentId}/approve`,
    );
  },

  rejectDocument(applicationId: string, documentId: string, reason: string) {
    return postTransition<{ id: string; status: "rejected" }>(
      `${transitionsBase(applicationId)}/documents/${documentId}/reject`,
      { reason },
    );
  },
};

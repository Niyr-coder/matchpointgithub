// Domain errors. Throw these from Server Actions / Services; the API layer
// translates them to HTTP via toHttpError().

import { AuthError } from "@/lib/auth/session";
import { httpFail } from "./response";
import { ZodError } from "zod";
import { translateErrorMessage } from "@/lib/user-facing/errors";

export class MpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 422,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "MpError";
  }
}

export function toHttpError(err: unknown) {
  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".") || "_";
      (fields[path] ??= []).push(issue.message);
    }
    return httpFail(400, "VALIDATION.FAILED", translateErrorMessage({ code: "VALIDATION.FAILED", message: "Invalid input", fields }), { fields });
  }
  if (err instanceof AuthError) {
    const status = err.code === "AUTH.UNAUTHENTICATED" ? 401 : 403;
    return httpFail(status, err.code, translateErrorMessage({ code: err.code, message: err.message }));
  }
  if (err instanceof MpError) {
    return httpFail(
      err.status,
      err.code,
      translateErrorMessage({ code: err.code, message: err.message, fields: err.fields }),
      err.fields ? { fields: err.fields } : undefined,
    );
  }
  // unknown
   
  console.error("[api] unexpected error", err);
  return httpFail(500, "INTERNAL.UNEXPECTED", translateErrorMessage({ code: "INTERNAL.UNEXPECTED", message: "Something went wrong" }));
}

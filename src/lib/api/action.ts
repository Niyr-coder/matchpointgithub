// Server Action result envelope + runner helper.
// Use runAction() to wrap a Zod-validated server action so errors funnel
// to the same shape that Route Handlers serve.

import { z, ZodError } from "zod";
import { ApiErr, ApiOk, fail, ok } from "./response";
import { MpError } from "./errors";
import { AuthError } from "@/lib/auth/session";
import { captureError } from "@/lib/observability/sentry";
import { requireWritable } from "@/server/flags/read-only";

export type ActionResult<T> = ApiOk<T> | ApiErr;

type ActionFn<I, O> = (input: I) => Promise<O>;

export type RunActionOptions = {
  /** Si true, respeta read_only_mode (admins bypass). */
  mutation?: boolean;
};

export async function runAction<S extends z.ZodTypeAny, O>(
  schema: S,
  rawInput: unknown,
  fn: ActionFn<z.infer<S>, O>,
  options?: RunActionOptions,
): Promise<ActionResult<O>> {
  try {
    const input = schema.parse(rawInput);
    if (options?.mutation) {
      await requireWritable();
    }
    const data = await fn(input);
    return ok(data);
  } catch (err) {
    return mapErr(err);
  }
}

/** Atajo para mutaciones que deben respetar read_only_mode. */
export async function runMutation<S extends z.ZodTypeAny, O>(
  schema: S,
  rawInput: unknown,
  fn: ActionFn<z.infer<S>, O>,
): Promise<ActionResult<O>> {
  return runAction(schema, rawInput, fn, { mutation: true });
}

function mapErr(err: unknown): ApiErr {
  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".") || "_";
      (fields[path] ??= []).push(issue.message);
    }
    // DEBUG: emit each issue to server log so we can see which field failed.
    console.error("[runAction] ZodError issues:", JSON.stringify(err.issues, null, 2));
    return fail("VALIDATION.FAILED", "Invalid input", { fields });
  }
  if (err instanceof AuthError) return fail(err.code, err.message);
  if (err instanceof MpError)
    return fail(err.code, err.message, err.fields ? { fields: err.fields } : undefined);
  captureError(err, { layer: "action" });
  return fail("INTERNAL.UNEXPECTED", "Something went wrong");
}

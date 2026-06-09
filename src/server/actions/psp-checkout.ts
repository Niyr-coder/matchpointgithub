"use server";

import "server-only";

import { z } from "zod";
import { runMutation, type ActionResult } from "@/lib/api/action";
import { requireUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { beginPspCheckout, type BeginPspCheckoutResult } from "@/lib/payments/checkout";
import { PAYMENT_PROVIDER_KEYS } from "@/lib/payments/types";

const BeginPspCheckoutSchema = z.object({
  transactionId: UuidSchema,
  provider: z.enum(PAYMENT_PROVIDER_KEYS).optional(),
});

export async function beginPspCheckoutAction(
  input: unknown,
): Promise<ActionResult<BeginPspCheckoutResult>> {
  return runMutation(BeginPspCheckoutSchema, input, async ({ transactionId, provider }) => {
    const userId = await requireUserId();
    return beginPspCheckout({
      transactionId,
      userId,
      ...(provider && provider !== "manual" ? { provider } : {}),
    });
  });
}

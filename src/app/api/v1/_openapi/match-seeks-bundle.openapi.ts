// OpenAPI: "Busco partido" (match seeks).
// Esta feature se opera por server actions (no hay Route Handlers REST aún),
// así que registramos solo los component schemas para que el spec documente
// los tipos. Cuando se exponga API pública, agregar registry.registerPath().
import { registry } from "@/lib/api/openapi/registry";
import {
  AcceptApplicantSchema,
  ApplyToMatchSeekSchema,
  CancelMatchSeekSchema,
  CreateMatchSeekSchema,
  ListMatchSeeksParamsSchema,
  MatchSeekApplicationSchema,
  MatchSeekApplicationStatusSchema,
  MatchSeekSchema,
  MatchSeekStatusSchema,
  WithdrawApplicationSchema,
} from "@/lib/schemas/match-seeks";

registry.register("MatchSeek", MatchSeekSchema);
registry.register("MatchSeekStatus", MatchSeekStatusSchema);
registry.register("MatchSeekApplication", MatchSeekApplicationSchema);
registry.register("MatchSeekApplicationStatus", MatchSeekApplicationStatusSchema);
registry.register("CreateMatchSeek", CreateMatchSeekSchema);
registry.register("ApplyToMatchSeek", ApplyToMatchSeekSchema);
registry.register("AcceptApplicant", AcceptApplicantSchema);
registry.register("CancelMatchSeek", CancelMatchSeekSchema);
registry.register("WithdrawApplication", WithdrawApplicationSchema);
registry.register("ListMatchSeeksParams", ListMatchSeeksParamsSchema);

export const _registered = true;

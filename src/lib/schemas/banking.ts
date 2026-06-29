// Esquemas bancarios compartidos entre quedadas y partners.
// Fuente de verdad para PaymentAccountSchema; quedadas lo re-exporta desde aquí.

export {
  PaymentAccountSchema,
  QuedadaAccountTypeSchema as AccountTypeSchema,
} from "./quedadas";

export type { PaymentAccount } from "./quedadas";

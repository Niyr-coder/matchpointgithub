"use client";

import { CookieConsentBanner } from "./CookieConsentBanner";

/** Montaje global de avisos legales (cookies). El aviso de beta vive en AuthModal. */
export function LegalComplianceShell() {
  return <CookieConsentBanner />;
}

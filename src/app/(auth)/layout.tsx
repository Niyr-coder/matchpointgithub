// Auth route-group layout: full-bleed centered card, no dashboard chrome.
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 20% 0%, rgba(16,185,129,0.10), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(99,102,241,0.10), transparent 55%), #fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

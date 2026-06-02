"use client";

import { useEffect, useState } from "react";
import { formatAnalyticsUpdatedLabel } from "@/lib/formatRelativeTime";

export function AnalyticsUpdatedLabel({ updatedAt }: { updatedAt: string | null }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!updatedAt) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [updatedAt]);

  const text = formatAnalyticsUpdatedLabel(updatedAt, now);
  if (!text) return null;

  return (
    <span className="profile-v3-mono profile-v3-body-sm" style={{ color: "#737373", letterSpacing: "0.06em" }}>
      {text}
    </span>
  );
}

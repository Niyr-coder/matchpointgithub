"use client";

import Link from "next/link";
import { HandoffIcon } from "./HandoffIcon";

type ProfileEmptyAction =
  | { label: string; href: string }
  | { label: string; onClick: () => void };

export function ProfileEmptyState({
  icon,
  title,
  text,
  action,
  compact = false,
}: {
  icon: string;
  title: string;
  text: string;
  action?: ProfileEmptyAction;
  compact?: boolean;
}) {
  const actionNode = action ? (
    "href" in action ? (
      <Link href={action.href} className="btn btn-outline profile-empty-state__cta">
        {action.label}
      </Link>
    ) : (
      <button type="button" className="btn btn-outline profile-empty-state__cta" onClick={action.onClick}>
        {action.label}
      </button>
    )
  ) : null;

  return (
    <div className={`profile-empty-state${compact ? " profile-empty-state--compact" : ""}`}>
      <div className="profile-empty-state__icon" aria-hidden>
        <HandoffIcon name={icon} size={compact ? 20 : 24} color="var(--muted-fg)" />
      </div>
      <p className="profile-empty-state__title">{title}</p>
      <p className="profile-empty-state__text">{text}</p>
      {actionNode}
    </div>
  );
}

export function openCrearMatchModal() {
  window.dispatchEvent(new CustomEvent("mp-open-crear-match"));
}

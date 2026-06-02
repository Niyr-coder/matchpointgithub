"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ProfileV3Actions = {
  onUpgrade: () => void;
  onChallenge: () => void;
  onMessage: () => void;
  onFriend: () => void;
  onEditBio: () => void;
  onShare: () => void;
  onAvatar: () => void;
  friendState: "none" | "pending" | "friends";
  actionPending: boolean;
  isMine: boolean;
};

const ProfileV3ActionsContext = createContext<ProfileV3Actions | null>(null);

export function ProfileV3ActionsProvider({ value, children }: { value: ProfileV3Actions; children: ReactNode }) {
  return <ProfileV3ActionsContext.Provider value={value}>{children}</ProfileV3ActionsContext.Provider>;
}

export function useProfileV3Actions(): ProfileV3Actions {
  const v = useContext(ProfileV3ActionsContext);
  if (!v) throw new Error("ProfileV3ActionsProvider requerido");
  return v;
}

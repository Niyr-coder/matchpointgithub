"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProfileData } from "../profile-types";
import { sendFriendRequest } from "@/server/actions/friends";
import { startConversation } from "@/server/actions/messaging";
import { useToast } from "../../ToastProvider";
import { useRealtimeRefresh } from "../../useRealtimeRefresh";
import { EditBioModal } from "../EditBioModal";
import { AvatarOverlay } from "./AvatarOverlay";
import { PerfilV3DataProvider } from "./PerfilV3Context";
import { ProfileV3ActionsProvider } from "./ProfileV3ActionsContext";
import { mapProfileDataToPerfilMe, ownerSubFromProfile } from "./mapProfileData";
import { PerfilV3Board } from "./PerfilV3";
import { PerfilV3BoardScout } from "./PerfilV3Scout";
import { PROFILE_V3_SCOUT_ENABLED } from "./profileV3Flags";
import type { RetarHeroContext } from "@/server/actions/matches";
import { updateMyAvatar } from "@/server/actions/me";
import "./profile-v3.css";

export type ProfileV3ScreenViewProps = {
  data: ProfileData;
  viewerMode?: "public";
  viewerIsPremium?: boolean;
  initialFriendship?: "none" | "pending" | "friends";
  visitorRetarContext?: RetarHeroContext | null;
};

export function ProfileV3ScreenView({
  data,
  viewerMode,
  viewerIsPremium = false,
  initialFriendship = "none",
  visitorRetarContext = null,
}: ProfileV3ScreenViewProps) {
  const isMine = viewerMode !== "public";
  const ownerSub = ownerSubFromProfile(data);
  const useScout =
    PROFILE_V3_SCOUT_ENABLED &&
    !isMine &&
    viewerIsPremium &&
    !!visitorRetarContext?.scout;

  useRealtimeRefresh(
    data.meUserId
      ? [
          { table: "player_stats", filter: `user_id=eq.${data.meUserId}` },
          { table: "ranking_snapshots", filter: `user_id=eq.${data.meUserId}` },
          { table: "matches", filter: `team_a_player_ids=cs.{${data.meUserId}}` },
          { table: "matches", filter: `team_b_player_ids=cs.{${data.meUserId}}` },
          { table: "role_assignments", filter: `user_id=eq.${data.meUserId}` },
        ]
      : [],
    { enabled: !!data.meUserId },
  );

  const perfilMe = useMemo(
    () => mapProfileDataToPerfilMe(data, { visitorRetarContext }),
    [data, visitorRetarContext],
  );

  const [friend, setFriend] = useState(initialFriendship);
  const [avatarOverlayOpen, setAvatarOverlayOpen] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [actionPending, startActionTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const handleAvatarUploaded = async (publicUrl: string) => {
    const res = await updateMyAvatar({ avatarUrl: publicUrl });
    if (res.ok) {
      toast({ icon: "check", title: "Foto actualizada" });
      setAvatarOverlayOpen(false);
      router.refresh();
    } else {
      toast({ icon: "x", title: "No se pudo actualizar", sub: res.error.message });
    }
  };

  const shareProfile = async () => {
    const url = `${window.location.origin}/dashboard/user/players/${data.username}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: data.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ icon: "check", title: "Link copiado", sub: "Comparte tu perfil" });
      }
    } catch {
      /* cancelado */
    }
  };

  const requestFriend = () => {
    if (!data.meUserId) return;
    startActionTransition(async () => {
      const r = await sendFriendRequest({ toUserId: data.meUserId! });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      setFriend("pending");
      toast({ icon: "user-plus", title: `Solicitud enviada a ${data.name}` });
    });
  };

  const openConversation = () => {
    if (!data.meUserId) return;
    startActionTransition(async () => {
      const r = await startConversation({ kind: "dm", memberIds: [data.meUserId!] });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      router.push(`/dashboard/user/chat?conv=${r.data.id}`);
    });
  };

  const challengePlayer = () => {
    if (!data.meUserId) return;
    window.dispatchEvent(
      new CustomEvent("mp-open-crear-match", {
        detail: { opponentId: data.meUserId, opponentName: data.name },
      }),
    );
  };

  const actions = {
    onUpgrade: () => router.push("/dashboard/user/mi-plan?upgrade=premium"),
    onChallenge: challengePlayer,
    onMessage: openConversation,
    onFriend: requestFriend,
    onEditBio: () => setEditingBio(true),
    onShare: shareProfile,
    onAvatar: () => setAvatarOverlayOpen(true),
    friendState: friend,
    actionPending,
    isMine,
  };

  return (
    <>
      <PerfilV3DataProvider value={perfilMe}>
        <ProfileV3ActionsProvider value={actions}>
          <div
            className="mp-profile-v3 w-full min-w-0 max-w-full"
            data-screen-label={isMine ? "Mi perfil" : `Perfil de ${data.name.trim().split(/\s+/)[0] ?? data.name}`}
          >
            {useScout ? (
              <PerfilV3BoardScout ownerSub={ownerSub} />
            ) : (
              <PerfilV3Board sub={ownerSub} view={isMine ? "mine" : "public"} />
            )}
          </div>
        </ProfileV3ActionsProvider>
      </PerfilV3DataProvider>

      {avatarOverlayOpen && data.meUserId && isMine && (
        <AvatarOverlay
          userId={data.meUserId}
          currentUrl={data.avatarUrl}
          onClose={() => setAvatarOverlayOpen(false)}
          onUploaded={handleAvatarUploaded}
        />
      )}
      {isMine && editingBio && <EditBioModal initialBio={data.bio} onClose={() => setEditingBio(false)} />}
    </>
  );
}

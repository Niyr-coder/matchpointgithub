"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PublicPreviewModal } from "./PublicPreviewModal";

type PreviewProps = React.ComponentProps<typeof PublicPreviewModal>;

export function PartnerTorneoRailLinks({
  preview,
  categories,
  blocks,
  prizes,
}: PreviewProps) {
  return (
    <div className="card mp-partner-torneo-rail-card">
      <div className="label-mp">Accesos rápidos</div>
      <nav className="mp-partner-torneo-rail-nav" aria-label="Accesos rápidos">
        <Link href="/dashboard/partner/p-brackets" className="mp-partner-torneo-rail-link">
          <Icon name="trophy" size={14} />
          <span>
            <b>Brackets</b>
            <small>Cuadro y marcadores en vivo</small>
          </span>
          <Icon name="chevron-right" size={14} className="mp-partner-torneo-rail-link-chevron" />
        </Link>
        <PublicPreviewModal
          preview={preview}
          categories={categories}
          blocks={blocks}
          prizes={prizes}
          compact
        />
        <Link href="/dashboard/partner/p-inscritos" className="mp-partner-torneo-rail-link">
          <Icon name="users" size={14} />
          <span>
            <b>Inscritos</b>
            <small>Vista completa de inscripciones</small>
          </span>
          <Icon name="chevron-right" size={14} className="mp-partner-torneo-rail-link-chevron" />
        </Link>
      </nav>
    </div>
  );
}

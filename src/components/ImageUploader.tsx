"use client";

// Componente reusable para subir una imagen a un bucket de Supabase Storage
// y avisar al parent con la public URL. NO actualiza la DB — eso lo hace el
// parent llamando a una server action específica (updateMyAvatar, etc).
//
// Validaciones client-side: MIME type (image/*), tamaño (default 4 MB).
// Path generado: `{folder}/{filenameSuffix}-{timestamp}.{ext}`.
//
// Para bucket público: devuelve la public URL directa.
// Para bucket privado: el caller debe pedir signed URL aparte (no soportado aquí).

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { getBrowserClient } from "@/lib/db/client.browser";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  bucket: string;
  folder: string;                          // ej. "{userId}" o "{clubId}"
  filenamePrefix?: string;                 // ej. "avatar", "logo", "cover"
  currentUrl?: string | null;
  shape?: "circle" | "rectangle";
  height?: number;
  onUploaded: (publicUrl: string) => void | Promise<void>;
  disabled?: boolean;
};

export function ImageUploader({
  bucket,
  folder,
  filenamePrefix = "image",
  currentUrl,
  shape = "rectangle",
  height = 160,
  onUploaded,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);

  const pickFile = () => {
    if (busy || disabled) return;
    inputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError("Solo JPG, PNG o WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Máximo ${MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }

    // Preview optimista mientras sube.
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    setBusy(true);
    try {
      const supabase = getBrowserClient();
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${folder}/${filenamePrefix}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });
      if (upErr) {
        setError(upErr.message);
        setPreview(currentUrl ?? null);
        return;
      }

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      // Cache-bust para que el navegador no muestre la versión anterior.
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;
      setPreview(publicUrl);
      await onUploaded(publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falló la subida");
      setPreview(currentUrl ?? null);
    } finally {
      setBusy(false);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  const radius = shape === "circle" ? "50%" : 12;
  const aspectStyle: React.CSSProperties =
    shape === "circle"
      ? { width: height, height, borderRadius: radius }
      : { width: "100%", height, borderRadius: radius };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        onClick={pickFile}
        disabled={busy || disabled}
        style={{
          ...aspectStyle,
          background: preview ? "transparent" : "var(--muted)",
          border: "2px dashed var(--border)",
          cursor: busy || disabled ? "default" : "pointer",
          position: "relative",
          overflow: "hidden",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Vista previa"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: busy
              ? "rgba(0,0,0,0.45)"
              : preview
                ? "rgba(0,0,0,0)"
                : "transparent",
            color: "#fff",
            transition: "background 150ms",
          }}
        >
          {busy ? (
            <span style={{ fontSize: 12, fontWeight: 800 }}>Subiendo…</span>
          ) : !preview ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "var(--muted-fg)" }}>
              <Icon name="image-plus" size={20} />
              <span style={{ fontSize: 11, fontWeight: 700 }}>Subir imagen</span>
            </div>
          ) : null}
        </div>
      </button>
      {error && <div style={{ fontSize: 11, color: "#dc2626" }}>{error}</div>}
      {preview && !busy && !disabled && (
        <button
          type="button"
          onClick={pickFile}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--primary)",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            alignSelf: "flex-start",
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          Cambiar imagen
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        onChange={onChange}
        style={{ display: "none" }}
      />
    </div>
  );
}

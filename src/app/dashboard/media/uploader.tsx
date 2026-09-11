"use client";

/**
 * Client-side compression before upload (BUILD_PLAN 7.2): a 5MB phone photo becomes a
 * ~250KB webp before it leaves the device. This keeps a shared host's storage and a
 * seller's mobile data sane, and avoids any serverless timeout on the way in.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/kit";

const MAX_EDGE = 1600;
const QUALITY = 0.82;

async function compress(file: File): Promise<File> {
  if (file.size < 400_000 || !file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", QUALITY));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" });
}

export function Uploader({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const upload = async () => {
    if (!files.length) return;
    setBusy(true); setError(null);
    let done = 0;
    for (const f of files) {
      setProgress(`${++done}/${files.length}`);
      const small = await compress(f);
      const fd = new FormData();
      fd.set("file", small, small.name);
      const res = await fetch(`/api/media/upload?business=${businessId}`, { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(`${f.name}: ${j.error ?? "upload failed. Try a smaller photo."}`);
      }
    }
    setFiles([]); setBusy(false); setProgress("");
    router.refresh();
  };

  return (
    <div className="card card-pad">
      <label className="grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-[var(--color-line-strong)] p-6 text-center hover:border-[var(--color-ink)]">
        <span className="text-sm font-medium">{busy ? `Uploading ${progress}...` : "Tap to choose photos, or drop them here"}</span>
        <span className="mt-1 text-xs text-[var(--color-ink-faint)]">JPG, PNG or WebP, up to 8MB each. Big photos are resized for you.</span>
        <input
          ref={input} type="file" accept="image/*" multiple className="sr-only"
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
          onDrop={(e) => { e.preventDefault(); }}
        />
      </label>
      {files.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">{files.length} file{files.length === 1 ? "" : "s"} ready</span>
          <Button size="sm" onClick={upload} disabled={busy}>{busy ? "Working..." : "Upload"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setFiles([])} disabled={busy}>Clear</Button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}

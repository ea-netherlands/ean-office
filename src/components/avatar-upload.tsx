"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAvatarAction, removeAvatarAction } from "@/actions/avatar";
import { Avatar, Icon, Notice, btnSecondary } from "@/components/ui";

// Rendered at up to 96px, and phones are 3x — 256px was sized for the 32px
// circles this started out as and goes soft the moment a face is worth
// looking at. 384px JPEG at q0.82 is still only ~40KB.
const MAX_PX = 384;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

/**
 * Pick a photo, see it immediately.
 *
 * Cropping and shrinking happen in the browser: a phone photo is 4MB and
 * 4000px wide, and neither a server action's body limit nor a free-tier
 * Postgres wants that. The canvas centre-crops to a square and exports a
 * 384px JPEG at quality 0.82 — about 40KB, enough to stay sharp at the 96px
 * it's shown at on a 3x phone screen, and small enough to keep in the
 * database next to everything else rather than standing up a file store for
 * one feature.
 */
export function AvatarUpload({
  name,
  src,
  className = "",
}: {
  name: string;
  src: string | null;
  className?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(src);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function shrink(file: File): Promise<string> {
    // `from-image` matters: a photo taken on a phone carries its rotation in
    // EXIF, and without this every one of them arrives sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = MAX_PX;
    canvas.height = MAX_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2, // centre crop — faces sit in the middle
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      MAX_PX,
      MAX_PX
    );
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That needs to be an image file.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("That photo is very large — try one under 12MB.");
      return;
    }
    startTransition(async () => {
      let dataUrl: string;
      try {
        dataUrl = await shrink(file);
      } catch {
        setError("We couldn't read that image — try a JPEG or PNG.");
        return;
      }
      const res = await saveAvatarAction(dataUrl);
      if (res.error) {
        setError(res.error);
        return;
      }
      setPreview(dataUrl);
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <Avatar name={name} src={preview} size="xl" />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className={`${btnSecondary} py-1.5 px-3`}
          >
            <Icon name="camera" />
            {pending ? "Saving…" : preview ? "Change photo" : "Add a photo"}
          </button>
          {preview && !pending && (
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  await removeAvatarAction();
                  setPreview(null);
                  router.refresh();
                })
              }
              className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer px-1"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = ""; // so picking the same file twice still fires
        }}
      />
      {error && (
        <Notice tone="error" className="mt-2">
          {error}
        </Notice>
      )}
    </div>
  );
}

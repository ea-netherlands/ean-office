"use client";

import { btnPrimary } from "@/components/ui";

export function PrintQrButton() {
  return (
    <button className={btnPrimary} onClick={() => window.print()}>
      Print stickers
    </button>
  );
}

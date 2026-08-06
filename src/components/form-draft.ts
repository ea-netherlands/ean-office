"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Second line of defence for long forms: what's typed is mirrored into
 * sessionStorage as it's typed, so a refresh, a stray back-swipe or a dropped
 * connection doesn't cost someone their answers either. Only *empty* fields
 * are filled on restore, so anything the server echoed back always wins.
 *
 * `revision` re-runs the restore after the form has been re-keyed by a failed
 * submit — the hook's own component never unmounts, only the <form> below it.
 */
export function useFormDraft(key: string, revision: number = 0) {
  const ref = useRef<HTMLFormElement>(null);
  const storageKey = `ean-office:draft:${key}`;

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Private mode, or storage disabled — the draft is a bonus, not a need.
    }
  }, [storageKey]);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;

    restore(form, storageKey);
    const save = () => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(snapshot(form)));
      } catch {
        // Quota or disabled storage: nothing to do, and nothing to tell them.
      }
    };
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    return () => {
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
    };
  }, [storageKey, revision]);

  return { ref, clear };
}

function snapshot(form: HTMLFormElement): Record<string, string[]> {
  const data = new FormData(form);
  const out: Record<string, string[]> = {};
  for (const [name, value] of data.entries()) {
    if (typeof value !== "string") continue; // files are never drafted
    (out[name] ??= []).push(value);
  }
  return out;
}

function restore(form: HTMLFormElement, storageKey: string): void {
  let saved: Record<string, string[]>;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    saved = JSON.parse(raw);
  } catch {
    return;
  }

  for (const [name, values] of Object.entries(saved)) {
    const fields = form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`[name="${CSS.escape(name)}"]`);
    for (const field of fields) {
      if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
        if (!field.checked && values.includes(field.value)) field.checked = true;
      } else if (!field.value) {
        const next = values[0];
        if (next !== undefined) field.value = next;
      }
    }
  }
}

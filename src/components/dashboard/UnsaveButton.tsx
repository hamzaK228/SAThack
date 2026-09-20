"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleSave } from "@/app/dashboard/actions";

export default function UnsaveButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function unsave() {
    setBusy(true);
    setError(false);
    try {
      const result = await toggleSave(questionId, false);
      if (!result.ok) throw new Error("Remove failed");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <><button className="saved-unsave" onClick={unsave} disabled={busy}>
      ✕ Remove
    </button>{error && <span role="alert">Could not remove. Please try again.</span>}</>
  );
}

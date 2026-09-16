"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleSave } from "@/app/dashboard/actions";

export default function UnsaveButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function unsave() {
    setBusy(true);
    await toggleSave(questionId);
    router.refresh();
  }

  return (
    <button className="saved-unsave" onClick={unsave} disabled={busy}>
      ✕ Remove
    </button>
  );
}

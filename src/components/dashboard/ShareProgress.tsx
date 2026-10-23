"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Trash2 } from "lucide-react";
import { createShareLink, revokeShareLink } from "@/app/dashboard/feature-actions";

export type ShareLink = {
  id: string;
  url: string;
  expiresAt: string;
};

export default function ShareProgress({ links }: { links: ShareLink[] }) {
  const router = useRouter();
  const [created, setCreated] = useState<ShareLink | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setMessage("");
    startTransition(async () => {
      const result = await createShareLink(7);
      if (!result.ok || !result.url || !result.id || !result.expiresAt) {
        setMessage(result.error ?? "Could not create a link.");
        return;
      }
      setCreated({ id: result.id, url: result.url, expiresAt: result.expiresAt });
      setMessage("7-day link ready. Copy it and send it to a parent or mentor.");
      router.refresh();
    });
  }

  function revoke(id: string) {
    setMessage("");
    startTransition(async () => {
      const result = await revokeShareLink(id);
      if (!result.ok) {
        setMessage(result.error ?? "Could not revoke that link.");
        return;
      }
      if (created?.id === id) setCreated(null);
      setMessage("Link revoked.");
      router.refresh();
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setMessage("Copy failed — select the link and copy it manually.");
    }
  }

  const rows = created ? [created, ...links.filter((link) => link.id !== created.id)] : links;

  return (
    <section className="settings-section share-progress">
      <div className="settings-section-head">
        <Link2 size={19} />
        <div>
          <h2 className="dash-section-title">Share progress</h2>
          <p>A read-only link for a parent, teacher or mentor. It shows stats and recent test scores, never answers or email.</p>
        </div>
      </div>
      <button className="btn btn-primary" type="button" onClick={create} disabled={pending}>
        {pending ? "Working…" : "Create a 7-day link"}
      </button>
      {message && <p role="status">{message}</p>}
      {rows.length > 0 && (
        <ul className="share-link-list">
          {rows.map((link) => (
            <li key={link.id}>
              <code>{link.url}</code>
              <span>expires {link.expiresAt.slice(0, 10)}</span>
              <button className="btn btn-ghost" type="button" onClick={() => void copy(link.url)}>
                <Copy size={14} /> {copied === link.url ? "Copied" : "Copy"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => revoke(link.id)} disabled={pending}>
                <Trash2 size={14} /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

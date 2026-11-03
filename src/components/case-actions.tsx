"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TermTip } from "@/components/term-tip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AlertStatus, CaseStatus } from "@/lib/db/types";

type Tip = { href: string; label: string; tip: string };

async function postJson(url: string, body: unknown): Promise<string | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) return payload.error || "Permintaan ditolak.";
  return null;
}

export function CaseActions({
  alertId,
  alertStatus,
  caseStatus,
  canEdit,
  initialNote,
  tips,
}: {
  alertId: string;
  alertStatus: AlertStatus;
  caseStatus: CaseStatus | null;
  canEdit: boolean;
  initialNote: string;
  tips: Record<string, Tip>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function run(task: () => Promise<string | null>) {
    setPending(true);
    setError("");
    const message = await task();
    setPending(false);
    if (message) setError(message);
    else router.refresh();
  }

  if (!canEdit) {
    return <p className="text-sm text-muted">Berkas ini ditugaskan ke analis lain.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["triaged", "escalated", "dismissed", "new"] as AlertStatus[]).map((status) => (
          <span key={status} className="inline-flex items-center">
            <Button
              type="button"
              size="sm"
              variant={status === alertStatus ? "default" : "outline"}
              disabled={pending}
              onClick={() => run(() => postJson(`/api/kasus/${alertId}`, { action: "alert", status }))}
            >
              {status === "new" ? "Baru" : status === "triaged" ? "Triase" : status === "escalated" ? "Eskalasi" : "Tutup peringatan"}
            </Button>
            <TermTip {...tips[status === "new" ? "baru" : status === "triaged" ? "triase-tombol" : status === "escalated" ? "eskalasi-tombol" : "tutup-peringatan"]} />
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {caseStatus ? (
          (["open", "investigating", "closed"] as CaseStatus[]).map((status) => (
            <span key={status} className="inline-flex items-center">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => postJson(`/api/kasus/${alertId}`, { action: "case", status }))}
              >
                {status === "open" ? "Kasus terbuka" : status === "investigating" ? "Diselidiki" : "Tutup kasus"}
              </Button>
              <TermTip {...tips[status === "open" ? "kasus-terbuka" : status === "investigating" ? "diselidiki" : "tutup-kasus"]} />
            </span>
          ))
        ) : (
          <span className="inline-flex items-center">
            <Button type="button" size="sm" disabled={pending} onClick={() => run(() => postJson(`/api/kasus/${alertId}`, { action: "open" }))}>
              Buka kasus
            </Button>
            <TermTip {...tips["buka-kasus"]} />
          </span>
        )}
        <span className="inline-flex items-center">
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => postJson(`/api/kasus/${alertId}/reskor`, {}))}>
            Skor ulang
          </Button>
          <TermTip {...tips["skor-ulang"]} />
        </span>
        <span className="inline-flex items-center">
          <Button type="button" size="sm" variant="ghost" asChild>
            <a href={`/api/kasus/${alertId}/pdf`}>Unduh PDF</a>
          </Button>
          <TermTip {...tips["unduh-pdf"]} />
        </span>
      </div>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const note = String(new FormData(event.currentTarget).get("note") ?? "");
          void run(() => postJson(`/api/kasus/${alertId}`, { action: "note", note }));
        }}
      >
        <label className="block text-sm">
          <span className="inline-flex items-center">Catatan analis <TermTip {...tips.catatan} /></span>
          <Textarea name="note" defaultValue={initialNote} maxLength={2000} className="mt-1" placeholder="Temuan, sumber yang sudah dicek, atau alasan eskalasi." />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Simpan catatan</Button>
      </form>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

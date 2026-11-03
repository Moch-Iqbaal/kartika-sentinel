"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AlertStatus, CaseStatus } from "@/lib/db/types";

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
}: {
  alertId: string;
  alertStatus: AlertStatus;
  caseStatus: CaseStatus | null;
  canEdit: boolean;
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
          <Button
            key={status}
            type="button"
            size="sm"
            variant={status === alertStatus ? "default" : "outline"}
            disabled={pending}
            onClick={() => run(() => postJson(`/api/kasus/${alertId}`, { action: "alert", status }))}
          >
            {status === "new" ? "Baru" : status === "triaged" ? "Triase" : status === "escalated" ? "Eskalasi" : "Tutup peringatan"}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {caseStatus ? (
          (["open", "investigating", "closed"] as CaseStatus[]).map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => postJson(`/api/kasus/${alertId}`, { action: "case", status }))}
            >
              {status === "open" ? "Kasus terbuka" : status === "investigating" ? "Diselidiki" : "Tutup kasus"}
            </Button>
          ))
        ) : (
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => postJson(`/api/kasus/${alertId}`, { action: "open" }))}>
            Buka kasus
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => postJson(`/api/kasus/${alertId}/reskor`, {}))}>
          Skor ulang IndoBERT lokal
        </Button>
        <Button type="button" size="sm" variant="ghost" asChild>
          <a href={`/api/kasus/${alertId}/pdf`}>Unduh PDF</a>
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

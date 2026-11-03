"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AnalyzeForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"text" | "url">("text");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/analisis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: mode,
        text: String(form.get("text") ?? ""),
        url: String(form.get("url") ?? ""),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    setPending(false);
    if (!response.ok || !payload.id) {
      setError(payload.error || "Analisis gagal.");
      return;
    }
    router.push(`/kasus/${payload.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant={mode === "text" ? "default" : "outline"} onClick={() => setMode("text")}>
          Teks
        </Button>
        <Button type="button" variant={mode === "url" ? "default" : "outline"} onClick={() => setMode("url")}>
          URL
        </Button>
      </div>
      {mode === "text" ? (
        <Textarea name="text" required minLength={12} maxLength={6000} placeholder="Tempel narasi berbahasa Indonesia…" />
      ) : (
        <Input name="url" required type="url" placeholder="https://www.youtube.com/watch?v=…" />
      )}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Memeriksa…" : "Analisis"}
      </Button>
    </form>
  );
}

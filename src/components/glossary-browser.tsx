"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { GlossaryGroup } from "@/lib/glossary";

export function GlossaryBrowser({ groups }: { groups: GlossaryGroup[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          if (!needle) return true;
          return `${entry.title} ${entry.summary} ${entry.detail ?? ""}`.toLowerCase().includes(needle);
        }),
      }))
      .filter((group) => group.entries.length > 0);
  }, [groups, needle]);
  const total = visible.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Panduan Istilah</h1>
      <p className="max-w-3xl text-sm leading-6 text-muted">
        Setiap istilah yang tampil di aplikasi ada di daftar ini, dikelompokkan menurut halamannya. Angka ambang dibaca dari kode skor.
      </p>
      <label className="block max-w-md text-sm">
        Cari istilah
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder="Ketik label, misalnya Pita, SSRF, atau Ditriase"
          className="mt-1"
        />
      </label>
      <p className="text-xs text-muted">{total} istilah</p>
      {visible.length === 0 ? (
        <Card className="p-4 text-sm text-muted">Tidak ada istilah untuk pencarian ini.</Card>
      ) : (
        visible.map((group) => (
          <section key={group.id} id={group.id} className="scroll-mt-6 space-y-2">
            <h2 className="text-lg font-medium">{group.title}</h2>
            <div className="space-y-2">
              {group.entries.map((entry) => (
                <Card key={entry.id} id={entry.id} className="scroll-mt-6 p-4">
                  <h3 className="font-medium">{entry.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{entry.summary}</p>
                  {entry.detail ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-info">Detail teknis</summary>
                      <p className="mt-1 text-xs leading-5 text-muted">{entry.detail}</p>
                    </details>
                  ) : null}
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

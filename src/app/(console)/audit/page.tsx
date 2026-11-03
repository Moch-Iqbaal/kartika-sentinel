import { currentSession } from "@/lib/auth/session";
import { listAudit } from "@/lib/db/store";
import { formatWhen } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AuditPage() {
  const session = await currentSession();
  if (!session) return null;
  if (session.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Log audit</h1>
        <p className="mt-2 text-sm text-muted">Log perubahan status hanya dapat dibaca admin.</p>
      </div>
    );
  }
  let entries: ReturnType<typeof listAudit> = [];
  let error = "";
  try {
    entries = listAudit(session);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Log gagal dibaca.";
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Log audit</h1>
      <p className="max-w-3xl text-sm text-muted">
        Perubahan status peringatan dan kasus dicatat di sini. Pada Postgres, pemicu SECURITY DEFINER menulis log yang sama. Retensi menghapus unggahan demo lebih dari 90 hari yang tidak terhubung ke kasus.
      </p>
      <form action="/api/admin/retensi" method="post">
        <Button type="submit" variant="outline" size="sm">Jalankan retensi 90 hari</Button>
      </form>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2">Waktu</th>
              <th className="px-3 py-2">Tabel</th>
              <th className="px-3 py-2">Aksi</th>
              <th className="px-3 py-2">Aktor</th>
              <th className="px-3 py-2">Perubahan</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td className="px-3 py-4 text-muted" colSpan={5}>Belum ada catatan.</td></tr>
            ) : entries.map((entry) => (
              <tr key={entry.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">{formatWhen(entry.createdAt)}</td>
                <td className="px-3 py-2">{entry.tableName}</td>
                <td className="px-3 py-2">{entry.action}</td>
                <td className="px-3 py-2 font-mono text-xs">{entry.actor?.slice(0, 8) ?? "—"}</td>
                <td className="max-w-md px-3 py-2 font-mono text-xs break-all">{entry.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

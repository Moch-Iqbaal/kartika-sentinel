/**
 * Tanda ⓘ kecil di kartu skor. Seluruh tombol adalah tautan ke panduan.
 * Teks muncul saat kursor atau fokus ada di atasnya, dan tetap bisa diklik di layar sentuh.
 */
export function TermTip({ href, label, tip }: { href: string; label: string; tip: string }) {
  return (
    <a
      href={href}
      aria-label={`Penjelasan ${label}. ${tip}`}
      className="group relative ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <span aria-hidden className="text-xs leading-none">ⓘ</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-5 z-30 hidden w-64 rounded-md border border-border bg-slate-950 p-2 text-left text-xs font-normal normal-case leading-5 text-foreground shadow-lg group-hover:block group-focus-visible:block"
      >
        {tip} <span className="text-info">Buka panduan.</span>
      </span>
    </a>
  );
}

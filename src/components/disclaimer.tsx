export function Disclaimer({ mode }: { mode?: string }) {
  return (
    <p className="text-sm leading-6 text-muted">
      Sistem hanya merekomendasikan. Putusan tetap pada analis. Skor bukan penetapan hoaks.
      {mode === "mode ringan"
        ? " Mode ringan: skor dari model n-gram yang disimpan di repo dan heuristik. IndoBERT tidak dipanggil."
        : " IndoBERT on-premise: klasifikasi berjalan di mesin analis, bukan di Inference API."}{" "}
      Kartu model umn-cyber/indobert-hoax melaporkan akurasi evaluasi penulis, bukan uji aplikasi ini.
      Teks pendek dapat melenceng.
    </p>
  );
}

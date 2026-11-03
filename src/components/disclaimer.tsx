export function Disclaimer({ modelReady }: { modelReady?: string }) {
  return (
    <p className="text-sm leading-6 text-muted">
      Sistem hanya merekomendasikan. Putusan tetap pada analis. Skor bukan penetapan hoaks.
      Kartu model umn-cyber/indobert-hoax melaporkan akurasi evaluasi penulis, bukan uji aplikasi ini.
      Teks pendek dapat melenceng. {modelReady ? `IndoBERT lokal: ${modelReady}.` : null}
    </p>
  );
}

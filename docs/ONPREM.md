# IndoBERT on-premise di Mac

Web di Vercel tidak wajib memanggil model neural. Bila `LOCAL_HOAX_URL` kosong, dasbor bertuliskan **mode ringan**: skor dari model n-gram di repo dan heuristik. Itu sengaja, bukan kegagalan.

Untuk skor **IndoBERT on-premise**, proses Python berjalan di MacBook pemilik (Apple Silicon). Cloudflare quick tunnel memberi URL `https://….trycloudflare.com` tanpa akun dan tanpa kartu. URL itu berubah setiap kali tunnel dijalankan ulang.

## Satu perintah

Di Mac:

```bash
brew install cloudflared
./scripts/start-onprem.sh
```

Skrip menolak sistem yang bukan macOS arm64. Ia membuat `.venv`, memasang torch untuk Mac, mengunduh bobot publik bila belum ada, lalu:

1. menjalankan `services/hoax/server.py` hanya di `127.0.0.1:43124`;
2. membuat `LOCAL_MODEL_TOKEN` bila belum ada dan menyimpannya di `.onprem-token` (berkas ini tidak di-commit);
3. menjalankan `cloudflared tunnel --url http://127.0.0.1:43124`.

Salin dua baris yang dicetak:

```text
LOCAL_HOAX_URL=https://NAMA.trycloudflare.com/classify
LOCAL_MODEL_TOKEN=...
```

Tempel ke environment Vercel, redeploy, dan biarkan terminal Mac tetap terbuka. Token yang sama harus ada di Mac dan di Vercel. Web hanya menerima HTTPS untuk host yang bukan loopback, dan mengirim header `x-kartika-model-token`.

Permintaan pertama bisa lama karena bobot dimuat di dalam permintaan. Dasbor menampilkan **IndoBERT on-premise · sedang bangun** dan memakai n-gram sementara. Setelah `/health` di mesin lokal berisi `"ready": true`, skor ulang memakai IndoBERT.

Menutup terminal mematikan tunnel. Jalankan skrip lagi, salin URL baru, dan perbarui `LOCAL_HOAX_URL` di Vercel.

## Yang tidak dilakukan skrip

Tidak memasang kartu, tidak membuat akun Cloudflare, dan tidak mengirim bobot ke Vercel. Bobot tetap di disk Mac, di folder `models/`.

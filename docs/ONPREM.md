# IndoBERT on-premise di Mac

Web di Vercel tidak wajib memanggil model neural. Bila `LOCAL_HOAX_URL` kosong, dasbor bertuliskan **mode ringan**: skor dari model n-gram di repo dan heuristik. Itu sengaja, bukan kegagalan.

Untuk skor **IndoBERT on-premise**, proses Python berjalan di MacBook pemilik (Apple Silicon). Cloudflare quick tunnel memberi URL `https://….trycloudflare.com` tanpa akun dan tanpa kartu. URL itu berubah setiap kali tunnel dijalankan ulang, dan skrip mendaftarkannya sendiri ke web.

## Satu perintah

Di Mac:

```bash
brew install cloudflared
./scripts/start-onprem.sh
```

Skrip menolak sistem yang bukan macOS arm64. Ia membuat `.venv`, memasang torch untuk Mac, mengunduh bobot publik bila belum ada, lalu:

1. menjalankan `services/hoax/server.py` hanya di `127.0.0.1:43124`;
2. menyimpan `LOCAL_MODEL_TOKEN` di `.env.onprem` (tidak di-commit) dan memakai token yang sama pada restart;
3. menjalankan `cloudflared tunnel --url http://127.0.0.1:43124`;
4. mengirim URL tunnel dan token ke `POST /api/model/register`, lalu heartbeat tiap 30 detik.

Sekali saja, buat `.env.onprem` di root repo:

```text
KARTIKA_APP_URL=https://kartika-sentinel.vercel.app
MODEL_REGISTER_SECRET=<nilai yang sama dengan environment Vercel>
```

Nilai rahasia ada di Vercel, proyek kartika-sentinel, Settings, Environment Variables, kunci `MODEL_REGISTER_SECRET`. Jangan menyalinnya ke git.

Setelah itu cukup `git pull` dan `./scripts/start-onprem.sh`. URL tunnel yang berubah tidak perlu ditempel lagi ke Vercel. `/api/health` menulis `indobert: "siap"` bila heartbeat segar dan model siap, atau `"offline"` bila Mac diam lebih dari 90 detik.

Web hanya menerima HTTPS untuk host yang bukan loopback, dan mengirim header `x-kartika-model-token`.

Permintaan pertama bisa lama karena bobot dimuat di dalam permintaan. Dasbor menampilkan **IndoBERT on-premise · sedang bangun** dan memakai n-gram sementara. Setelah `/health` di mesin lokal berisi `"ready": true`, skor ulang memakai IndoBERT.

Menutup terminal mematikan tunnel. Jalankan skrip lagi. Pendaftaran mengirim URL baru sendiri.

## Yang tidak dilakukan skrip

Tidak memasang kartu, tidak membuat akun Cloudflare, dan tidak mengirim bobot ke Vercel. Bobot tetap di disk Mac, di folder `models/`.

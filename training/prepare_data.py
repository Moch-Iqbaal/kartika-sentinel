#!/usr/bin/env python3
"""Bangun dataset campuran multi-sumber untuk IndoBERT Kartika Sentinel.

Aturan:
- Label: FAKTA=0, HOAX=1
- Mafindo maksimal ~35% dari baris HOAX (bukan mayoritas)
- FAKTA dari banyak outlet idn-news-az (+ berita politik mafindo repo sebagai FAKTA)
- Dedup, balance kelas, split stratified (+ time-aware kalau ada tanggal)
- Hard test: berita resmi (termasuk Yonif 143) + klaim hoaks

Sumber HOAX yang dicoba (skip kalau gagal/gated):
  - umn-cyber/mafindo-2024 (subset HOAX, di-cap)
  - GitHub jibranfawaid/turnbackhoax-dataset (NARASI klaim)
  - SEACrowd/id_hoax_news
  - nlp-brin-id/* (gated — dicoba, boleh gagal)
  - Kaggle (opsional lewat --kaggle-dir kalau user sudah unduh)

Sumber FAKTA:
  - esteler-ai/idn-news-az (semua host, boost topik TNI/Papua/pemerintah)
  - mafindo repo news/politik-merge_40k.csv (portal berita, label FAKTA)
  - mafindo-2024 baris is_hoax=0 (di-cap agar tidak mendominasi)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import pandas as pd

TOPIC_RE = re.compile(
    r"\b(?:tni|yonif|kodam|korem|prajurit|polri|papua|ri-?png|pemerintah|presiden|"
    r"kementerian|ksad|panglima|militer|kepolisian|brimob|tni\s*ad|tni\s*al|tni\s*au|"
    r"kogabwilhan|satgas|perbatasan)\b",
    re.I,
)

# Hard test FAKTA (harus skor HOAX rendah) — berita resmi / gaya redaksi
HARD_FAKTA = [
    {
        "title": "450 Prajurit TNI AD Yonif 143 Kembali ke Lampung Usai Bertugas di Perbatasan RI-PNG",
        "content": (
            "Sebanyak 450 prajurit TNI AD Yonif 143/Triwira Yudha/Jaya kembali ke Lampung "
            "setelah bertugas di perbatasan RI-PNG. Kapenrem 043/Gatam menyambut kedatangan "
            "mereka di Pelabuhan Panjang sebelum menuju Markas Kodam XXI/Radin Inten. "
            "Panglima TNI dan KSAD mengapresiasi pengabdian prajurit di wilayah perbatasan."
        ),
        "expected": 0,
        "tag": "yonif143_tribun",
    },
    {
        "title": "Panglima TNI Tinjau Pos Perbatasan RI-PNG",
        "content": (
            "Panglima TNI Jenderal Agus Subiyanto meninjau pos perbatasan Indonesia-Papua Nugini "
            "dan memastikan kesiapan satgas Pamtas. Kunjungan resmi diliput oleh Dinas Penerangan TNI."
        ),
        "expected": 0,
        "tag": "official_tni_border",
    },
    {
        "title": "Presiden buka rapat kabinet di Istana Negara",
        "content": (
            "Presiden Republik Indonesia membuka rapat kabinet terbatas di Istana Negara, Jakarta, "
            "Senin pagi. Agenda membahas anggaran infrastruktur dan program ketahanan pangan nasional."
        ),
        "expected": 0,
        "tag": "istana_rapat",
    },
    {
        "title": "BMKG keluarkan peringatan dini cuaca ekstrem Jawa Barat",
        "content": (
            "Badan Meteorologi Klimatologi dan Geofisika mengeluarkan peringatan dini cuaca ekstrem "
            "untuk wilayah Jawa Barat hingga Rabu malam. Masyarakat diminta waspada banjir dan longsor."
        ),
        "expected": 0,
        "tag": "bmkg",
    },
    {
        "title": "Polri amankan jalur mudik Lebaran dengan rekayasa lalu lintas",
        "content": (
            "Korlantas Polri menerapkan rekayasa lalu lintas di jalur mudik utama. "
            "Kapolri memastikan personel disiagakan di titik rawan kemacetan dan kecelakaan."
        ),
        "expected": 0,
        "tag": "polri_mudik",
    },
    {
        "title": "KSAD pimpin upacara HUT TNI AD di Markas Besar",
        "content": (
            "Kepala Staf Angkatan Darat memimpin upacara peringatan HUT TNI AD di Markas Besar TNI AD, "
            "Jakarta. Sejumlah pejabat Kementerian Pertahanan hadir dalam acara resmi tersebut."
        ),
        "expected": 0,
        "tag": "hut_tni_ad",
    },
    {
        "title": "Satgas Yonif Raider berangkat tugas operasi di Papua",
        "content": (
            "Ratusan prajurit satgas Yonif Raider diberangkatkan untuk operasi teritorial di Papua "
            "sesuai perintah operasi yang sah. Keberangkatan digelar di Lanud setempat dan diliput media resmi."
        ),
        "expected": 0,
        "tag": "yonif_papua_official",
    },
    {
        "title": "Kementerian Pertahanan serahkan alutsista baru kepada TNI AL",
        "content": (
            "Menteri Pertahanan menyerahkan kapal patroli baru kepada TNI AL dalam upacara di dermaga utama. "
            "Serah terima dicatat dalam berita acara resmi Kementerian Pertahanan."
        ),
        "expected": 0,
        "tag": "kemhan_alutsista",
    },
    {
        "title": "Antara: Inflasi bulanan tetap terkendali menurut BPS",
        "content": (
            "Badan Pusat Statistik mencatat inflasi bulanan tetap terkendali. "
            "Kepala BPS menjelaskan kontribusi harga pangan dan transportasi dalam jumpa pers resmi."
        ),
        "expected": 0,
        "tag": "bps_inflasi",
    },
    {
        "title": "Kompas: Pemda DKI perpanjang masa berlaku SIM keliling",
        "content": (
            "Pemerintah Provinsi DKI Jakarta memperpanjang layanan SIM keliling di sejumlah titik. "
            "Warga dapat membawa berkas sesuai persyaratan yang diumumkan Polda Metro Jaya."
        ),
        "expected": 0,
        "tag": "dki_sim",
    },
    {
        "title": "Detik: PLN pastikan pasokan listrik aman saat libur nasional",
        "content": (
            "PT PLN (Persero) memastikan pasokan listrik aman selama libur nasional. "
            "Petugas siaga di pusat pengatur beban dan gardu induk prioritas."
        ),
        "expected": 0,
        "tag": "pln",
    },
    {
        "title": "Tribun: Kodam XII/Tpr gelar bakti sosial di perbatasan",
        "content": (
            "Kodam XII/Tanjungpura menggelar bakti sosial kesehatan dan pembagian sembako di wilayah perbatasan. "
            "Kegiatan dihadiri pejabat daerah dan diliput Tribun serta media lokal."
        ),
        "expected": 0,
        "tag": "kodam_baksos",
    },
    {
        "title": "CNN Indonesia: Jokowi tinjau proyek Ibu Kota Nusantara",
        "content": (
            "Presiden Joko Widodo meninjau kemajuan pembangunan Ibu Kota Nusantara. "
            "Menteri PUPR mendampingi dan memaparkan capaian konstruksi istana dan infrastruktur dasar."
        ),
        "expected": 0,
        "tag": "ikn_resmi",
    },
    {
        "title": "Liputan6: Bank Indonesia pertahankan suku bunga acuan",
        "content": (
            "Bank Indonesia memutuskan mempertahankan suku bunga acuan dalam Rapat Dewan Gubernur. "
            "Gubernur BI menjelaskan pertimbangan stabilitas nilai tukar dan inflasi."
        ),
        "expected": 0,
        "tag": "bi_suku_bunga",
    },
    {
        "title": "Tempo: Mahkamah Konstitusi jadwalkan sidang uji materi",
        "content": (
            "Mahkamah Konstitusi menjadwalkan sidang uji materi undang-undang pada pekan depan. "
            "Jadwal resmi diumumkan melalui situs MK dan keterangan humas."
        ),
        "expected": 0,
        "tag": "mk_sidang",
    },
    {
        "title": "Republika: Kemenag tetapkan awal Ramadan berdasarkan hisab dan rukyat",
        "content": (
            "Kementerian Agama menetapkan awal Ramadan setelah sidang isbat. "
            "Keputusan didasarkan pada hisab dan laporan rukyatul hilal dari sejumlah titik observasi."
        ),
        "expected": 0,
        "tag": "kemenag_ramadan",
    },
    {
        "title": "Okezone: Basarnas evakuasi korban banjir di Sulawesi",
        "content": (
            "Basarnas bersama TNI-Polri mengevakuasi warga terdampak banjir di Sulawesi. "
            "Posko darurat didirikan di balai desa dan dapur umum dioperasikan oleh BPBD."
        ),
        "expected": 0,
        "tag": "basarnas_banjir",
    },
    {
        "title": "Sindonews: DPR sahkan RUU terkait perlindungan data pribadi",
        "content": (
            "Dewan Perwakilan Rakyat mengesahkan rancangan undang-undang terkait perlindungan data pribadi "
            "dalam rapat paripurna. Naskah resmi akan dikirim ke pemerintah untuk pengundangan."
        ),
        "expected": 0,
        "tag": "dpr_ruu",
    },
    {
        "title": "TNI AU laksanakan latihan angkut semesta di Lanud",
        "content": (
            "TNI Angkatan Udara melaksanakan latihan angkut semesta di landasan udara utama. "
            "Kegiatan melibatkan pesawat angkut dan personel satuan udara sesuai jadwal latihan tahunan."
        ),
        "expected": 0,
        "tag": "tni_au_latihan",
    },
    {
        "title": "Polda Papua amankan barang bukti senjata rakitan",
        "content": (
            "Polda Papua mengamankan sejumlah barang bukti senjata rakitan hasil operasi rutin. "
            "Kapolda menyampaikan keterangan pers resmi mengenai kronologi penindakan."
        ),
        "expected": 0,
        "tag": "polda_papua",
    },
]

HARD_HOAX = [
    {
        "title": "20.000 prajurit TNI diterbangkan ke Gaza",
        "content": "Sebarkan! 20.000 prajurit TNI sudah diterbangkan ke Gaza sebagai pasukan perdamaian tanpa sepengetahuan DPR.",
        "expected": 1,
        "tag": "hoax_tni_gaza",
    },
    {
        "title": "Presiden diganti diam-diam malam ini",
        "content": "BREAKING: Presiden diganti diam-diam malam ini, segera viralkan sebelum dihapus media arus utama.",
        "expected": 1,
        "tag": "hoax_presiden_diganti",
    },
    {
        "title": "Vaksin mengandung chip pelacak satelit",
        "content": "Video: vaksin mengandung chip pelacak yang dikendalikan satelit asing. Jangan divaksin.",
        "expected": 1,
        "tag": "hoax_vaksin_chip",
    },
    {
        "title": "BBM naik malam ini sesuai pesan WA",
        "content": "Pesan berantai: malam ini BBM naik, premium Rp 9.500, pertalite Rp 11.000. Segera beli sekarang.",
        "expected": 1,
        "tag": "hoax_bbm_wa",
    },
    {
        "title": "Tsunami 100 meter akan hantam Jawa malam ini",
        "content": "BMKG diam-diam sudah tahu tsunami 100 meter akan hantam Jawa malam ini tapi disembunyikan pemerintah.",
        "expected": 1,
        "tag": "hoax_tsunami",
    },
    {
        "title": "Uang baru berciri chip RFID untuk pantau warga",
        "content": "Hati-hati uang emisi baru mengandung chip RFID agar pemerintah pantau setiap transaksi warga.",
        "expected": 1,
        "tag": "hoax_uang_chip",
    },
    {
        "title": "Panglima TNI kudeta istana",
        "content": "Video viral: Panglima TNI sudah kudeta dan menguasai Istana. Segera bagikan sebelum diblokir.",
        "expected": 1,
        "tag": "hoax_kudeta",
    },
    {
        "title": "Papua merdeka diakui PBB hari ini",
        "content": "PBB resmi akui kemerdekaan Papua hari ini. Berita ditutup-tutupi media Indonesia.",
        "expected": 1,
        "tag": "hoax_papua_pbb",
    },
    {
        "title": "Bantuan COVID cair Rp 10 juta scan barcode",
        "content": "Klik dan scan barcode ini untuk cairkan bantuan COVID Rp 10 juta dari pemerintah. Bagikan ke keluarga.",
        "expected": 1,
        "tag": "hoax_bantuan_barcode",
    },
    {
        "title": "Air putih campur lemon bunuh virus corona dalam 24 jam",
        "content": "Dokumen WHO bocor: air putih campur lemon membunuh virus corona dalam 24 jam. Farmasi tutup-tutupi.",
        "expected": 1,
        "tag": "hoax_lemon_corona",
    },
]


def norm(text: str) -> str:
    text = re.sub(r"https?://\S+", " ", str(text))
    text = re.sub(r"\[SALAH\]|\(SALAH\)|\[BENAR\]|\(BENAR\)", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip().lower()


def row_hash(title: str, content: str) -> str:
    return hashlib.sha1(f"{norm(title)}|{norm(content)[:800]}".encode()).hexdigest()


def clean_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["title"] = df["title"].fillna("").astype(str)
    df["content"] = df["content"].fillna("").astype(str)
    df = df[df["content"].str.len() >= 40]
    df["key"] = [row_hash(t, c) for t, c in zip(df["title"], df["content"])]
    return df.drop_duplicates("key")


def load_mafindo_all(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    rows = []
    for _, r in df.iterrows():
        label = int(r["is_hoax"])
        rows.append(
            {
                "title": r["title"],
                "content": r["content"],
                "label": 1 if label == 1 else 0,
                "source": "mafindo-2024-hoax" if label == 1 else "mafindo-2024-fakta",
                "date": "",
            }
        )
    return clean_frame(pd.DataFrame(rows))


def load_mafindo_news40k(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    try:
        df = pd.read_csv(path, encoding="utf-8", on_bad_lines="skip")
    except Exception:
        df = pd.read_csv(path, encoding="latin-1", on_bad_lines="skip")
    cols = {c.lower(): c for c in df.columns}
    title_c = cols.get("judul") or cols.get("title")
    content_c = cols.get("content") or cols.get("teks") or cols.get("text")
    if not title_c or not content_c:
        return pd.DataFrame()
    out = pd.DataFrame(
        {
            "title": df[title_c].astype(str),
            "content": df[content_c].astype(str),
            "label": 0,
            "source": "mafindo-repo-news40k",
            "date": "",
        }
    )
    return clean_frame(out)


def load_tbh_github(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, sep=";", encoding="latin-1", engine="python", on_bad_lines="skip")
    # Keep first 3 columns
    df = df.rename(columns={df.columns[0]: "Label", df.columns[1]: "Headline", df.columns[2]: "Body"})
    rows = []
    for _, r in df.iterrows():
        try:
            label = int(str(r["Label"]).strip())
        except Exception:
            continue
        body = str(r["Body"] or "")
        headline = str(r["Headline"] or "")
        # Extract NARASI claim if present (avoid training on full debunk as HOAX style)
        narasi = ""
        m = re.search(r"\(NARASI\)\s*:\s*(.*?)(?:======|$)", body, flags=re.I | re.S)
        if m:
            narasi = m.group(1).strip()
        text = narasi if len(narasi) >= 40 else body
        # Strip long reference tails
        text = re.split(r"======\s*REFERENSI", text, flags=re.I)[0]
        if label == 1:
            rows.append(
                {
                    "title": re.sub(r"\[SALAH\]|\(SALAH\)", "", headline, flags=re.I).strip(),
                    "content": text[:4000],
                    "label": 1,
                    "source": "tbh-github",
                    "date": "",
                }
            )
        else:
            # Label 0 in this scrape is often klarifikasi — treat as FAKTA only if clearly official clarification tone
            rows.append(
                {
                    "title": headline,
                    "content": text[:4000],
                    "label": 0,
                    "source": "tbh-github-klarifikasi",
                    "date": "",
                }
            )
    return clean_frame(pd.DataFrame(rows))


def try_load_seacrowd() -> pd.DataFrame:
    try:
        from datasets import load_dataset

        ds = load_dataset("SEACrowd/id_hoax_news", trust_remote_code=True)
        split = ds["train"] if "train" in ds else ds[list(ds.keys())[0]]
        rows = []
        for item in split:
            # schema varies; try common fields
            label_raw = item.get("label") or item.get("tags") or item.get("hoax")
            text = item.get("text") or item.get("content") or item.get("news") or ""
            title = item.get("title") or ""
            if isinstance(label_raw, str):
                lab = 1 if label_raw.lower() in {"hoax", "1", "fake", "false"} else 0
            else:
                lab = 1 if int(label_raw) == 1 else 0
            if len(str(text)) < 40:
                continue
            rows.append(
                {
                    "title": title,
                    "content": str(text),
                    "label": lab,
                    "source": "seacrowd-id_hoax_news",
                    "date": "",
                }
            )
        return clean_frame(pd.DataFrame(rows))
    except Exception as exc:
        print("SEACrowd skip:", type(exc).__name__, exc)
        return pd.DataFrame()


def try_load_brin() -> pd.DataFrame:
    for name in (
        "nlp-brin-id/id-hoax-report-merge",
        "nlp-brin-id/fakenews-mafindo",
        "nlp-brin-id/id-hoax-report-merge-v2",
    ):
        try:
            from datasets import load_dataset

            ds = load_dataset(name, split="train")
            rows = []
            for item in ds:
                title = str(item.get("Title") or item.get("title") or "")
                content = str(item.get("Content") or item.get("content") or "")
                label_id = item.get("Label_id", item.get("label_id", item.get("Label")))
                if isinstance(label_id, str):
                    lab = 1 if label_id.upper() in {"HOAX", "1"} else 0
                else:
                    lab = 1 if int(label_id) == 1 else 0
                if len(content) < 40:
                    continue
                src = str(item.get("Datasource") or name)
                rows.append(
                    {
                        "title": title,
                        "content": content,
                        "label": lab,
                        "source": f"brin:{src}",
                        "date": "",
                    }
                )
            if rows:
                print("BRIN loaded", name, len(rows))
                return clean_frame(pd.DataFrame(rows))
        except Exception as exc:
            print("BRIN skip", name, ":", type(exc).__name__, exc)
    return pd.DataFrame()


def load_extra_norm_csvs(raw_dir: Path) -> pd.DataFrame:
    frames = []
    for name in ("mendeley_norm.csv", "pierobeat_norm.csv"):
        path = raw_dir / "extra-hoax" / name
        if path.exists():
            frames.append(pd.read_csv(path))
            print("extra", name, len(frames[-1]))
    return clean_frame(pd.concat(frames, ignore_index=True)) if frames else pd.DataFrame()


def load_idn_news_csvs(raw_dir: Path) -> pd.DataFrame:
    frames = []
    for name in ("fakta_topic.csv", "fakta_general.csv"):
        p = raw_dir / "idn-news" / name
        if p.exists():
            frames.append(pd.read_csv(p))
    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True)
    df["label"] = 0
    df["source"] = df.get("source", "idn-news-az")
    if "date" not in df.columns:
        df["date"] = ""
    return clean_frame(df[["title", "content", "label", "source", "date"]])


def load_kaggle_dir(kaggle_dir: Path) -> pd.DataFrame:
    if not kaggle_dir or not kaggle_dir.exists():
        return pd.DataFrame()
    rows = []
    for csv in kaggle_dir.rglob("*.csv"):
        try:
            df = pd.read_csv(csv, on_bad_lines="skip")
        except Exception:
            continue
        cols = {c.lower(): c for c in df.columns}
        # heuristics
        text_c = cols.get("content") or cols.get("text") or cols.get("body") or cols.get("berita")
        title_c = cols.get("title") or cols.get("judul") or cols.get("headline")
        label_c = cols.get("label") or cols.get("is_hoax") or cols.get("hoax") or cols.get("class")
        if not text_c or not label_c:
            continue
        for _, r in df.iterrows():
            raw = str(r[label_c]).strip().lower()
            if raw in {"1", "hoax", "fake", "false", "salah"}:
                lab = 1
            elif raw in {"0", "valid", "real", "fakta", "benar", "fact", "non-hoax", "nonhoax"}:
                lab = 0
            else:
                continue
            content = str(r[text_c])
            if len(content) < 40:
                continue
            rows.append(
                {
                    "title": str(r[title_c]) if title_c else "",
                    "content": content,
                    "label": lab,
                    "source": f"kaggle:{csv.stem}",
                    "date": "",
                }
            )
    return clean_frame(pd.DataFrame(rows)) if rows else pd.DataFrame()


def stream_idn_news_if_needed(raw_dir: Path, max_topic: int, max_general: int, max_per_host: int) -> None:
    target_t = raw_dir / "idn-news" / "fakta_topic.csv"
    target_g = raw_dir / "idn-news" / "fakta_general.csv"
    if target_t.exists() and target_g.exists():
        print("idn-news CSV already present")
        return
    from datasets import load_dataset

    out = raw_dir / "idn-news"
    out.mkdir(parents=True, exist_ok=True)
    ds = load_dataset("esteler-ai/idn-news-az", split="train", streaming=True)
    by_host: Counter = Counter()
    topic_rows, general_rows = [], []
    seen = 0
    for item in ds:
        seen += 1
        link = str(item.get("link") or item.get("url") or "")
        m = re.search(r"https?://(?:www\.)?([^/]+)/", link)
        host = (m.group(1).lower() if m else "unknown").replace("www.", "")
        title = str(item.get("title") or "")
        content = str(item.get("text") or item.get("content") or "")
        if len(content) < 40:
            continue
        date = str(item.get("date") or "")
        row = {
            "title": title,
            "content": content,
            "link": link,
            "host": host,
            "date": date,
            "label": 0,
            "source": "idn-news-az",
        }
        if TOPIC_RE.search(title + " " + content):
            if len(topic_rows) < max_topic:
                topic_rows.append(row)
        else:
            if by_host[host] < max_per_host and len(general_rows) < max_general:
                general_rows.append(row)
                by_host[host] += 1
        if seen % 50000 == 0:
            print("stream seen", seen, "topic", len(topic_rows), "general", len(general_rows))
        if len(topic_rows) >= max_topic and len(general_rows) >= max_general:
            break
    pd.DataFrame(topic_rows).to_csv(target_t, index=False)
    pd.DataFrame(general_rows).to_csv(target_g, index=False)
    print("stream done", seen, len(topic_rows), len(general_rows), "hosts", len(by_host))


def cap_source(df: pd.DataFrame, source_prefix: str, label: int, max_rows: int) -> pd.DataFrame:
    mask = (df["label"] == label) & (df["source"].astype(str).str.startswith(source_prefix))
    keep = df[mask]
    other = df[~mask]
    if len(keep) <= max_rows:
        return df
    keep = keep.sample(n=max_rows, random_state=42)
    return pd.concat([other, keep], ignore_index=True)


def balance_classes(df: pd.DataFrame) -> pd.DataFrame:
    hoax = df[df.label == 1]
    fakta = df[df.label == 0].copy()
    n = min(len(hoax), len(fakta))
    if n == 0:
        return df
    # Prefer topic FAKTA (TNI/Papua/pemerintah) to kill topic bias
    fakta["_topic"] = fakta["title"].fillna("").str.contains(TOPIC_RE) | fakta["content"].fillna("").str.contains(TOPIC_RE)
    topic = fakta[fakta["_topic"]]
    other = fakta[~fakta["_topic"]]
    n_topic = min(len(topic), max(n // 2, min(n, len(topic))))
    n_other = n - n_topic
    parts = [topic.sample(n=n_topic, random_state=42)] if n_topic else []
    if n_other > 0:
        parts.append(other.sample(n=min(n_other, len(other)), random_state=42))
    fakta_s = pd.concat(parts, ignore_index=True).drop(columns=["_topic"], errors="ignore")
    # top up if short
    if len(fakta_s) < n:
        need = n - len(fakta_s)
        rest = fakta.drop(index=fakta_s.index, errors="ignore")
        if len(rest) == 0:
            rest = fakta
        fakta_s = pd.concat([fakta_s, rest.sample(n=min(need, len(rest)), random_state=42)], ignore_index=True)
        fakta_s = fakta_s.drop(columns=["_topic"], errors="ignore")
    return pd.concat(
        [hoax.sample(n=n, random_state=42), fakta_s.head(n)],
        ignore_index=True,
    ).sample(frac=1, random_state=42)


def write_hard_test(out: Path, fakta_pool: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for item in HARD_FAKTA + HARD_HOAX:
        rows.append(
            {
                "title": item["title"],
                "content": item["content"],
                "label": item["expected"],
                "tag": item["tag"],
                "source": "hard-manual",
            }
        )
    # Add many official-style FAKTA from topic pool if available
    if len(fakta_pool):
        topic = fakta_pool[
            fakta_pool["title"].fillna("").str.contains(TOPIC_RE)
            | fakta_pool["content"].fillna("").str.contains(TOPIC_RE)
        ]
        extra = topic.sample(n=min(80, len(topic)), random_state=42) if len(topic) else fakta_pool.head(0)
        for _, r in extra.iterrows():
            rows.append(
                {
                    "title": r["title"],
                    "content": str(r["content"])[:1500],
                    "label": 0,
                    "tag": "hard_pool_fakta",
                    "source": r.get("source", "idn-news-az"),
                }
            )
    hard = pd.DataFrame(rows).drop_duplicates(subset=["title"])
    hard_path = out / "hard_test.csv"
    hard.to_csv(hard_path, index=False)
    print("hard_test", len(hard), "->", hard_path)
    return hard


def composition_table(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby(["source", "label"]).size().reset_index(name="rows")
    g["label_name"] = g["label"].map({0: "FAKTA", 1: "HOAX"})
    return g.sort_values(["label", "rows"], ascending=[True, False])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, default=Path("/tmp/kartika-raw"))
    parser.add_argument("--out", type=Path, default=Path("training/data"))
    parser.add_argument("--kaggle-dir", type=Path, default=None)
    parser.add_argument("--mafindo-hoax-share", type=float, default=0.35)
    parser.add_argument("--max-topic", type=int, default=25000)
    parser.add_argument("--max-general", type=int, default=80000)
    parser.add_argument("--max-per-host", type=int, default=8000)
    parser.add_argument("--skip-stream", action="store_true")
    parser.add_argument("--proof-max", type=int, default=0, help="If >0, subsample train for CPU proof")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    args.raw.mkdir(parents=True, exist_ok=True)

    if not args.skip_stream:
        stream_idn_news_if_needed(args.raw, args.max_topic, args.max_general, args.max_per_host)

    frames = []
    mafindo_path = args.raw / "mafindo" / "all.csv"
    if not mafindo_path.exists():
        from huggingface_hub import hf_hub_download

        hf_hub_download("umn-cyber/mafindo-2024", "all.csv", repo_type="dataset", local_dir=str(args.raw / "mafindo"))
    frames.append(load_mafindo_all(mafindo_path))

    news40 = load_mafindo_news40k(args.raw / "mafindo" / "news" / "politik-merge_40k.csv")
    if len(news40):
        frames.append(news40)
        print("news40k", len(news40))

    tbh_path = args.raw / "tbh_scrapping.csv"
    if not tbh_path.exists():
        import urllib.request

        urllib.request.urlretrieve(
            "https://raw.githubusercontent.com/jibranfawaid/turnbackhoax-dataset/master/Scrapping.csv",
            tbh_path,
        )
    frames.append(load_tbh_github(tbh_path))

    sea = try_load_seacrowd()
    if len(sea):
        frames.append(sea)
        print("seacrowd", len(sea))
    brin = try_load_brin()
    if len(brin):
        frames.append(brin)
        print("brin", len(brin))

    extra = load_extra_norm_csvs(args.raw)
    if len(extra):
        frames.append(extra)

    idn = load_idn_news_csvs(args.raw)
    if len(idn):
        frames.append(idn)
        print("idn-news", len(idn))

    kag = load_kaggle_dir(args.kaggle_dir) if args.kaggle_dir else pd.DataFrame()
    if len(kag):
        frames.append(kag)
        print("kaggle", len(kag))

    df = pd.concat(frames, ignore_index=True)
    df = clean_frame(df)

    # Cap Mafindo share of HOAX rows
    hoax = df[df.label == 1]
    non_maf_hoax = hoax[~hoax["source"].astype(str).str.startswith("mafindo-2024")]
    maf_hoax = hoax[hoax["source"].astype(str).str.startswith("mafindo-2024")]
    # Want maf / total_hoax <= share  => maf <= share/(1-share) * non_maf
    if len(non_maf_hoax) > 0:
        max_maf = int((args.mafindo_hoax_share / max(1e-6, 1 - args.mafindo_hoax_share)) * len(non_maf_hoax))
        max_maf = max(max_maf, 500)  # keep some signal
        if len(maf_hoax) > max_maf:
            print(f"cap mafindo HOAX {len(maf_hoax)} -> {max_maf} (non-maf hoax={len(non_maf_hoax)})")
            maf_hoax = maf_hoax.sample(n=max_maf, random_state=42)
            df = pd.concat([df[df.label == 0], non_maf_hoax, maf_hoax], ignore_index=True)
    else:
        print("WARN: non-Mafindo HOAX sangat sedikit; cap longgar. Tambah Kaggle/BRIN saat tersedia.")
        # Still downweight: keep at most 40% of eventual balanced size via later undersample note
        if len(maf_hoax) > 6000:
            maf_hoax = maf_hoax.sample(n=6000, random_state=42)
            df = pd.concat([df[df.label == 0], maf_hoax], ignore_index=True)

    # Cap mafindo FAKTA so idn-news dominates official style
    df = cap_source(df, "mafindo-2024-fakta", 0, 8000)

    df = clean_frame(df)
    before_bal = len(df)
    df = balance_classes(df)
    print("balanced", before_bal, "->", len(df), "hoax", int((df.label == 1).sum()), "fakta", int((df.label == 0).sum()))

    comp = composition_table(df)
    comp.to_csv(args.out / "composition.csv", index=False)
    print(comp.to_string(index=False))

    # Exclude hard-test texts from train by hash of Yonif etc.
    hard = write_hard_test(args.out, df[df.label == 0])
    hard_keys = set(row_hash(t, c) for t, c in zip(hard["title"], hard["content"]))
    df = df[~df["key"].isin(hard_keys)]

    from sklearn.model_selection import train_test_split

    # Time-aware if enough dated rows
    dated = df[df.get("date", pd.Series(dtype=str)).astype(str).str.len() >= 8] if "date" in df.columns else df.head(0)
    if len(dated) > 500 and len(dated) > 0.3 * len(df):
        dated = dated.copy()
        dated["_dt"] = pd.to_datetime(dated["date"], errors="coerce")
        dated = dated.dropna(subset=["_dt"]).sort_values("_dt")
        cut = int(len(dated) * 0.8)
        train_d, rest_d = dated.iloc[:cut], dated.iloc[cut:]
        undated = df.drop(index=dated.index, errors="ignore")
        train_u, temp_u = train_test_split(undated, test_size=0.2, random_state=42, stratify=undated["label"]) if len(undated) else (undated, undated)
        val_d, test_d = train_test_split(rest_d, test_size=0.5, random_state=42, stratify=rest_d["label"]) if len(rest_d) > 10 else (rest_d, rest_d.iloc[0:0])
        val_u, test_u = train_test_split(temp_u, test_size=0.5, random_state=42, stratify=temp_u["label"]) if len(temp_u) > 10 else (temp_u, temp_u.iloc[0:0])
        train = pd.concat([train_d.drop(columns=["_dt"], errors="ignore"), train_u], ignore_index=True)
        val = pd.concat([val_d.drop(columns=["_dt"], errors="ignore"), val_u], ignore_index=True)
        test = pd.concat([test_d.drop(columns=["_dt"], errors="ignore"), test_u], ignore_index=True)
        print("split: time-aware + stratified undated")
    else:
        train, temp = train_test_split(df, test_size=0.2, random_state=42, stratify=df["label"])
        val, test = train_test_split(temp, test_size=0.5, random_state=42, stratify=temp["label"])
        print("split: stratified 80/10/10")

    if args.proof_max > 0 and len(train) > args.proof_max:
        train = train.sample(n=args.proof_max, random_state=42)
        print("proof subsample train", len(train))

    cols = ["title", "content", "label", "source"]
    for name, part in ("train", train), ("val", val), ("test", test):
        part[cols].to_csv(args.out / f"{name}.csv", index=False)
        print(name, len(part), "hoax", int((part.label == 1).sum()), "fakta", int((part.label == 0).sum()))

    meta = {
        "mafindo_hoax_share_target": args.mafindo_hoax_share,
        "train": len(train),
        "val": len(val),
        "test": len(test),
        "hard": len(hard),
        "hoax_by_source": composition_table(df[df.label == 1]).to_dict(orient="records"),
        "fakta_by_source": composition_table(df[df.label == 0]).to_dict(orient="records"),
    }
    (args.out / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("wrote", args.out)


if __name__ == "__main__":
    main()

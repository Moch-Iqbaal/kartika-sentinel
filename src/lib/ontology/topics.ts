import { cosine, embedText } from "@/lib/embed/hashing";

export type TopicId =
  | "tni"
  | "kodam"
  | "papua-kkb"
  | "misi-luar-negeri"
  | "ruu-tni"
  | "alutsista"
  | "satuan-khusus";

export type TopicDef = {
  id: TopicId;
  label: string;
  sensitivity: number;
  keywords: string[];
  prototype: string;
};

export type TopicHit = TopicDef & {
  score: number;
  keywordsHit: string[];
};

/**
 * Ontologi narasi militer. Sensitivitas adalah bobot kebijakan analis
 * (0–1), bukan fakta statistik. Pencocokan = kata kunci atau kosinus
 * terhadap kalimat prototipe.
 */
export const TOPICS: TopicDef[] = [
  {
    id: "tni",
    label: "TNI",
    sensitivity: 0.72,
    keywords: ["tni", "tentara nasional", "prajurit", "mabes", "panglima", "tentara"],
    prototype: "klaim tentang tentara nasional indonesia prajurit panglima dan mabes",
  },
  {
    id: "kodam",
    label: "Kodam",
    sensitivity: 0.78,
    keywords: ["kodam", "korem", "kodim", "koramil", "danrem", "kodam jaya"],
    prototype: "klaim operasi atau razia kodam korem kodim di wilayah",
  },
  {
    id: "papua-kkb",
    label: "Papua / KKB",
    sensitivity: 0.95,
    keywords: ["papua", "kkb", "opm", "intan jaya", "puncak", "nduga", "yahukimo", "habema", "soanggama"],
    prototype: "klaim serangan tni terhadap kkb atau opm di papua intan jaya",
  },
  {
    id: "misi-luar-negeri",
    label: "Misi luar negeri / Gaza",
    sensitivity: 0.9,
    keywords: ["gaza", "palestina", "pasukan perdamaian", "unifil", "garuda merah putih", "kontingen", "israel"],
    prototype: "klaim pengiriman pasukan tni atau misi perdamaian ke gaza palestina",
  },
  {
    id: "ruu-tni",
    label: "RUU / UU TNI",
    sensitivity: 0.86,
    keywords: ["ruu tni", "uu tni", "dwifungsi", "revisi uu", "supremasi sipil", "abri"],
    prototype: "narasi revisi undang-undang tni dwifungsi abri dan jabatan sipil prajurit",
  },
  {
    id: "alutsista",
    label: "Alutsista",
    sensitivity: 0.66,
    keywords: ["alutsista", "pesawat tempur", "pesawat siluman", "kapal selam", "rudal", "hercules", "jet"],
    prototype: "klaim pembelian atau pemakaian alutsista pesawat rudal kapal selam",
  },
  {
    id: "satuan-khusus",
    label: "Kopassus / Kostrad",
    sensitivity: 0.8,
    keywords: ["kopassus", "kostrad", "denjaka", "kopaska", "marinir"],
    prototype: "klaim operasi kopassus kostrad atau satuan khusus tni",
  },
];

export function matchTopics(text: string): TopicHit[] {
  const vector = embedText(text);
  const lower = text.toLowerCase();
  const hits: TopicHit[] = [];
  for (const topic of TOPICS) {
    const keywordsHit = topic.keywords.filter((keyword) => lower.includes(keyword));
    const similarity = cosine(vector, embedText(`${topic.prototype} ${topic.keywords.join(" ")}`));
    if (keywordsHit.length === 0 && similarity < 0.42) continue;
    const keywordScore = Math.min(1, keywordsHit.length / 2);
    hits.push({
      ...topic,
      score: Math.max(keywordScore, similarity),
      keywordsHit,
    });
  }
  return hits.sort((left, right) => right.score - left.score);
}

/** Jika tidak ada topik, lantai 0,35 supaya hoaks umum tidak hilang, tetapi tetap di bawah topik sensitif. */
export function topicSensitivity(hits: TopicHit[]): number {
  if (hits.length === 0) return 0.35;
  return Math.min(1, Math.max(...hits.map((hit) => hit.sensitivity * Math.min(1, hit.score))));
}

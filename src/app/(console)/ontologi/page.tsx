import { Card } from "@/components/ui/card";
import { topicCounts } from "@/lib/db";
import { TOPICS } from "@/lib/ontology/topics";

export default async function OntologyPage() {
  const counts = await topicCounts();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ontologi narasi</h1>
      <p className="max-w-3xl text-sm leading-6 text-muted">
        Topik dikenali dari kata kunci dan kemiripan kosinus terhadap kalimat prototipe. Sensitivitas adalah bobot kebijakan untuk peringkat, bukan statistik korban atau operasi.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {TOPICS.map((topic) => (
          <Card key={topic.id} className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-medium">{topic.label}</h2>
              <span className="font-mono text-sm text-gold">{topic.sensitivity.toLocaleString("id-ID")}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{topic.prototype}</p>
            <p className="mt-2 text-xs text-muted">Kata kunci: {topic.keywords.join(", ")}</p>
            <p className="mt-2 text-xs">Peringatan pada dasbor: {counts[topic.id] ?? 0}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

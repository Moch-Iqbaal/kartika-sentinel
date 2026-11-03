import { GlossaryBrowser } from "@/components/glossary-browser";
import { glossaryGroups } from "@/lib/glossary";

export default function GlossaryPage() {
  return <GlossaryBrowser groups={glossaryGroups()} />;
}

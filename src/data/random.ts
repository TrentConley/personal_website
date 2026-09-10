import type { CSSProperties } from "react";
import source from "../../random/config.yaml?raw";

export type RandomToolId = "factorio" | "lexicon" | "mars";
type RandomConfig = {
  page: { title: string; heading: string; href: string };
  labels: { back: string; loading: string; loadError: string };
  theme: Record<string, string>;
  tools: Array<{ id: RandomToolId; title: string; description: string; href: string; aliases: string[] }>;
};
export const random = JSON.parse(source) as RandomConfig;
export const randomTheme = random.theme as CSSProperties;

const paths = [random.page.href, ...random.tools.flatMap(tool => [tool.href, ...tool.aliases])];
if (new Set(paths).size !== paths.length) throw new Error("Random tool routes must be unique");
if (new Set(random.tools.map(tool => tool.id)).size !== random.tools.length) throw new Error("Random tool IDs must be unique");

import type { CSSProperties } from "react";
import source from "../../journal/config.yaml?raw";
import gallery from "./photos.json";

type JournalConfig = {
  theme: Record<string, string>;
  identity: { name: string; initials: string; role: string; title: string; description: string };
  navigation: Array<{ label: string; href: string; id: string }>;
  orbit: { href: string; label: string; eyebrow: string; title: string; description: string };
  hero: { eyebrow: string; lines: string[]; intro: string; photoId: string; photoLabel: string; linkLabel: string };
  writing: { number: string; label: string; title: string; date: string; duration: string; headline: string; description: string; href: string; linkLabel: string; photoId: string };
  photography: { number: string; label: string; title: string; description: string; photoIds: string[]; linkLabel: string; href: string };
  about: { number: string; label: string; title: string; description: string; contactLabel: string; email: string; github: string; githubLabel: string; footer: string; year: number };
  labels: { home: string; backToJournal: string; menu: string; skip: string; photoGallery: string };
};

export const journal = JSON.parse(source) as JournalConfig;
export const journalTheme = journal.theme as CSSProperties;

export function journalPhoto(id: string) {
  const photo = gallery.photos.find((item) => item.id === id);
  if (!photo) throw new Error(`Journal photograph is missing: ${id}`);
  return photo;
}

export const photoCount = gallery.photos.length;

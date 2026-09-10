import type { CSSProperties } from "react";
import source from "../../playground/config.yaml?raw";
import gallery from "./photos.json";

export type PlaygroundIconName = "home" | "photos" | "projects" | "writing" | "shuffle" | "grid" | "scatter" | "close" | "previous" | "next" | "email" | "github" | "orbit" | "reset" | "type" | "factory" | "eye" | "spark" | "network";
export type PlaygroundSlot = { x: number; y: number; w: number; rotation: number; mx: number; my: number; mw: number };
type PlaygroundConfig = {
  identity: { name: string; initials: string; role: string; title: string; email: string; emailLabel: string; github: string; orbit: string; writing: string };
  theme: Record<string, string>;
  navigation: Array<{ id: string; label: string; href: string }>;
  notFound: { title: string; heading: string; linkLabel: string; href: string };
  labels: Record<string, string>;
  interaction: { dragThreshold: number; swipeThreshold: number; keyboardStep: number; shuffleStep: number; throwMultiplier: number; maximumThrow: number; visibleEdge: number; topBoundary: number; bottomBoundary: number };
  scene: Array<PlaygroundSlot & { id: string }>;
};
export const playground = JSON.parse(source) as PlaygroundConfig;
export const playgroundTheme = playground.theme as CSSProperties;
export const playgroundPhotos = gallery.photos;
export const scenePhotos = playground.scene.map((slot) => {
  const photo = gallery.photos.find((item) => item.id === slot.id);
  if (!photo) throw new Error(`Missing playground photo: ${slot.id}`);
  return photo;
});

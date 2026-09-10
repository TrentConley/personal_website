import type { PlaygroundIconName } from "../data/playground";

export function PlaygroundIcon({ name }: { name: PlaygroundIconName }) {
  const paths = {
    home: <><path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10" /></>,
    photos: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8" cy="9" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></>,
    projects: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-5 2 2-14" /></>,
    writing: <><path d="m15 4 5 5-10 10-6 1 1-6L15 4Zm-8 9 4 4M14 5l5 5" /></>,
    shuffle: <><path d="M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 3-2 4-4m4-5c1-2 2-3 4-3h3m-4-4 4 4-4 4" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    scatter: <><rect x="3" y="5" width="11" height="14" rx="2" transform="rotate(-18 8 12)" /><path d="m14 4 7 2-3 14-6-1" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    previous: <path d="m14 5-7 7 7 7" />,
    next: <path d="m10 5 7 7-7 7" />,
    email: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
    github: <><path d="M9 20c-5 2-5-3-7-3m14 5v-4c0-1-.5-2-1-2 4 0 6-2 6-6 0-2-.5-3-2-4 0-1 0-3-1-4-2 0-3 1-4 2-2-.5-4-.5-6 0C7 3 6 2 4 2c-1 1-1 3-1 4-1 1-2 2-2 4 0 4 2 6 6 6-.5 0-1 1-1 2v4" transform="translate(2 1) scale(.82)" /></>,
    orbit: <><circle cx="12" cy="12" r="2" /><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)" /><path d="M6 4c4-2 11 5 13 10s0 8-3 6" /></>,
    reset: <><path d="M4 9a8 8 0 1 1 0 6M4 3v6h6" /></>,
    type: <><path d="M3 19 9 5l6 14M5 15h8M17 10h4v9m0-6c-6-1-6 6-1 5" /></>,
    factory: <><path d="M3 20V10l6 3V8l6 3V4h5v16H3ZM7 17h1m4 0h1m4 0h1" /></>,
    eye: <><path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
    network: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="m7 7 3 3m4 0 3-3M7 17l3-3m4 0 3 3" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

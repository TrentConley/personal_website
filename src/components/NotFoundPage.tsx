import { useEffect } from "react";
import { playground, playgroundTheme } from "../data/playground";
import { PlaygroundHeader } from "./PlaygroundHeader";
import { SiteNavigation } from "./SiteNavigation";
import "../playground.css";

export function NotFoundPage() {
  useEffect(() => { document.title = playground.notFound.title; }, []);
  return <div className="playground" style={playgroundTheme}>
    <PlaygroundHeader />
    <main className="site-not-found">
      <h1>{playground.notFound.heading}</h1>
      <a href={playground.notFound.href}>{playground.notFound.linkLabel}</a>
    </main>
    <SiteNavigation active="" />
  </div>;
}

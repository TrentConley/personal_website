import { useEffect } from "react";
import { playgroundTheme } from "../data/playground";
import { random, randomTheme } from "../data/random";
import { PlaygroundHeader } from "./PlaygroundHeader";
import { SiteNavigation } from "./SiteNavigation";
import "../random.css";

export function RandomPage() {
  useEffect(() => { document.title = random.page.title; }, []);
  return <div className="playground random-page" style={{...playgroundTheme, ...randomTheme}}>
    <PlaygroundHeader />
    <main className="random-main">
      <h1 className="playground-sr-only">{random.page.heading}</h1>
      <ul className="random-list">
        {random.tools.map(tool => <li key={tool.id}>
          <a className="random-link" href={tool.href}>
            <span className="random-link-text"><span className="random-title">{tool.title}</span><span className="random-description">{tool.description}</span></span>
            <span className="random-arrow" aria-hidden="true">↗</span>
          </a>
        </li>)}
      </ul>
    </main>
    <SiteNavigation active="random" />
  </div>;
}

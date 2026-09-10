import { Component, lazy, Suspense, type ReactNode } from "react";
import { playgroundTheme } from "../data/playground";
import { random, type RandomToolId } from "../data/random";
import { PlaygroundHeader } from "./PlaygroundHeader";
import { SiteNavigation } from "./SiteNavigation";
import "../random.css";

const tools = {
  factorio: lazy(() => import("./FactorioBlueprintPage").then(module => ({default:module.FactorioBlueprintPage}))),
  lexicon: lazy(() => import("./VocabularyPage").then(module => ({default:module.VocabularyPage}))),
  mars: lazy(() => import("./MarsTrackerPage").then(module => ({default:module.MarsTrackerPage}))),
};

for (const tool of random.tools) {
  if (!Object.hasOwn(tools, tool.id)) throw new Error(`Unknown Random tool: ${tool.id}`);
}

function ToolStatus({ error }: { error?: Error }) {
  return <div className="playground" style={playgroundTheme}>
    <PlaygroundHeader />
    <main className="site-not-found">
      <p role={error ? "alert" : "status"}>{error ? random.labels.loadError : random.labels.loading}</p>
      {error && <p>{error.message}</p>}
      <a href={random.page.href}>{random.labels.back}</a>
    </main>
    <SiteNavigation active="random" />
  </div>;
}

class ToolErrorBoundary extends Component<{children:ReactNode}, {error:Error|null}> {
  state: {error:Error|null} = {error:null};
  static getDerivedStateFromError(error:Error) { return {error}; }
  render() { return this.state.error ? <ToolStatus error={this.state.error} /> : this.props.children; }
}

export function RandomToolPage({ id }: { id: RandomToolId }) {
  const Tool = tools[id];
  return <ToolErrorBoundary key={id}>
    <Suspense fallback={<ToolStatus />}><Tool /></Suspense>
  </ToolErrorBoundary>;
}

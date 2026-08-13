import { ArticlePage } from "./components/ArticlePage";
import { FactorioBlueprintPage } from "./components/FactorioBlueprintPage";
import { HomePage } from "./components/HomePage";
import { MarsTrackerPage } from "./components/MarsTrackerPage";
import { VocabularyPage } from "./components/VocabularyPage";

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  if (path === "/blog/parallel-betting") {
    return <ArticlePage />;
  }

  if (path === "/projects/factorio-blueprints") {
    return <FactorioBlueprintPage />;
  }

  if (path === "/projects/mars-tracker") {
    return <MarsTrackerPage />;
  }

  if (path === "/projects/vocabulary") {
    return <VocabularyPage />;
  }

  if (path === "/writing" || path === "/blog") {
    return <HomePage initialPanel="writing" />;
  }

  return <HomePage />;
}

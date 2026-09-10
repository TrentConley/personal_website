import { ArticlePage } from "./components/ArticlePage";
import { HomePage } from "./components/HomePage";
import { PhotosPage } from "./components/PhotosPage";
import { PlaygroundPage } from "./components/PlaygroundPage";
import { NotFoundPage } from "./components/NotFoundPage";
import { RandomPage } from "./components/RandomPage";
import { RandomToolPage } from "./components/RandomToolPage";
import { random } from "./data/random";

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  if (path === random.page.href) return <RandomPage />;
  const tool = random.tools.find(item => item.href === path || item.aliases.includes(path));
  if (tool) return <RandomToolPage id={tool.id} />;

  if (path === "/orbit") {
    return <HomePage />;
  }

  if (path === "/photos") {
    return <PhotosPage />;
  }

  if (path === "/blog/parallel-betting") {
    return <ArticlePage />;
  }

  if (path === "/writing" || path === "/blog") {
    return <ArticlePage />;
  }

  if (path === "/") {
    return <PlaygroundPage />;
  }

  return <NotFoundPage />;
}

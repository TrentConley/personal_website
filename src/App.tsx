import { ArticlePage } from "./components/ArticlePage";
import { HomePage } from "./components/HomePage";

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  if (path === "/blog/parallel-betting") {
    return <ArticlePage />;
  }

  if (path === "/writing" || path === "/blog") {
    return <HomePage initialPanel="writing" />;
  }

  return <HomePage />;
}

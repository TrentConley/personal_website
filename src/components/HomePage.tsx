import { useEffect, useState } from "react";
import { projects } from "../data/profile";
import {
  orbitBodyByPanel,
  OrbitPanel,
  OrbitalField,
} from "./OrbitalField";

type HomePageProps = {
  initialPanel?: OrbitPanel | null;
};

export function HomePage({ initialPanel = null }: HomePageProps) {
  const [activePanel, setActivePanel] = useState<OrbitPanel | null>(initialPanel);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePanel(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <div className="orbit-page">
      <header className="orbit-header">
        <a href="/" className="orbit-header__mark" aria-label="Trent Conley home">
          TC
        </a>
        <span>AI Engineer · SpaceX</span>
      </header>

      <OrbitalField activePanel={activePanel} onSelect={setActivePanel} />

      <div className="orbit-identity" aria-label="Trent Conley, AI Engineer at SpaceX">
        <h1>Trent Conley</h1>
        <p>AI Engineer at SpaceX</p>
      </div>

      <section
        className={`orbit-panel${activePanel ? " is-open" : ""}`}
        aria-live="polite"
        aria-hidden={!activePanel}
      >
        {activePanel ? (
          <>
            <button
              className="orbit-panel__close"
              type="button"
              onClick={() => setActivePanel(null)}
              aria-label="Close panel"
            >
              ×
            </button>

            {activePanel === "projects" ? (
              <div className="orbit-panel__content">
                <p className="orbit-panel__label">
                  Projects · {orbitBodyByPanel.projects}
                </p>
                <div className="project-mini-list">
                  {projects.map((project) => (
                    <article key={project.name} className="project-mini">
                      <h2>{project.name}</h2>
                      <div>
                        {project.links.map((link) => (
                          <a
                            key={link.url}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {link.label} ↗
                          </a>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {activePanel === "writing" ? (
              <div className="orbit-panel__content">
                <p className="orbit-panel__label">
                  Writing · {orbitBodyByPanel.writing}
                </p>
                <a className="blog-mini" href="/blog/parallel-betting">
                  <span>July 2026</span>
                  <h2>
                    Would you risk everything on a coin flip if the math told
                    you to?
                  </h2>
                  <strong>Read ↗</strong>
                </a>
              </div>
            ) : null}

            {activePanel === "contact" ? (
              <div className="orbit-panel__content">
                <p className="orbit-panel__label">
                  Contact · {orbitBodyByPanel.contact}
                </p>
                <div className="contact-mini">
                  <a href="mailto:trentconley@gmail.com">
                    trentconley@gmail.com
                  </a>
                  <a
                    href="https://github.com/TrentConley"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub ↗
                  </a>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

    </div>
  );
}

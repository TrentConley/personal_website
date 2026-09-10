import { useEffect, useState } from "react";
import { OrbitPanel, OrbitalField } from "./OrbitalField";
import { journal } from "../data/journal";
import { playground } from "../data/playground";

type HomePageProps = {
  initialPanel?: OrbitPanel | null;
};

export function HomePage({ initialPanel = null }: HomePageProps) {
  const [activePanel, setActivePanel] = useState<OrbitPanel | null>(initialPanel);

  useEffect(() => {
    document.title = `${journal.identity.name} — ${journal.orbit.label}`;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePanel(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <div className="orbit-page">
      <OrbitalField activePanel={activePanel} onSelect={setActivePanel} />

      <a className="orbit-journal-link" href="/" aria-label={playground.labels.home}>←</a>

      <a className="orbit-photos-link" href="/photos">
        Photos <span aria-hidden="true">↗</span>
      </a>

      <div
        className={`orbit-identity${activePanel ? " is-panel-open" : ""}`}
        aria-label="Trent Conley, AI Engineer at SpaceX"
      >
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

            {activePanel === "writing" ? (
              <div className="orbit-panel__content">
                <p className="orbit-panel__label">
                  Writing
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
                  Contact
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

      <a
        className="sky-credit"
        href="https://www.esa.int/ESA_Multimedia/Images/2020/12/The_colour_of_the_sky_from_Gaia_s_Early_Data_Release_32"
        target="_blank"
        rel="noreferrer"
      >
        Gaia EDR3 · ESA/Gaia/DPAC
      </a>
    </div>
  );
}

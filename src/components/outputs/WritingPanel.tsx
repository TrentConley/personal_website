const articleUrl = "/blog/parallel-betting";
const sourceUrl = "https://github.com/TrentConley/parallel-betting";

export function WritingPanel() {
  return (
    <article className="panel writing-panel">
      <a
        className="writing-panel__image"
        href={articleUrl}
        aria-label="Read Would you risk everything on a coin flip if the math told you to?"
      >
        <img
          src="/blog/parallel-betting/norway-2026.jpg"
          alt="A horned sheep photographed in Norway"
        />
        <span>norway_2026.jpg</span>
      </a>

      <div className="writing-panel__content">
        <span className="panel__label">featured writing</span>
        <div className="project-card__meta">
          <span>probability</span>
          <span>decision-making</span>
          <span>8 min read</span>
        </div>
        <h2 className="writing-panel__title">
          Would you risk everything on a coin flip if the math told you to?
        </h2>
        <p className="writing-panel__summary">
          Expected value says to bet it all. The outcome you&apos;re likely to
          live through says something very different—until you start playing
          games in parallel.
        </p>

        <div className="writing-panel__stats" aria-label="Article highlights">
          <div>
            <strong>25%</strong>
            <span>single-game optimum</span>
          </div>
          <div>
            <strong>4 games</strong>
            <span>enough to cross 50%</span>
          </div>
        </div>

        <div className="project-card__links">
          <a href={articleUrl}>read essay</a>
          <a
            href="/blog/parallel-betting/parallel-betting.pdf"
            target="_blank"
            rel="noreferrer"
          >
            pdf
          </a>
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            source
          </a>
        </div>
      </div>
    </article>
  );
}

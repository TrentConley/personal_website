import { useEffect } from "react";
import { journal, journalPhoto, journalTheme, photoCount } from "../data/journal";
import { JournalHeader } from "./JournalHeader";
import "../journal.css";

export function FieldJournalPage({ initialSection }: { initialSection?: string }) {
  const cover = journalPhoto(journal.hero.photoId);
  const essayPhoto = journalPhoto(journal.writing.photoId);
  const photographs = journal.photography.photoIds.map(journalPhoto);

  useEffect(() => {
    document.title = journal.identity.title;
    const sectionId = initialSection === undefined ? window.location.hash.slice(1) : initialSection;
    if (sectionId) document.getElementById(sectionId)?.scrollIntoView();
  }, [initialSection]);

  return (
    <div className="field-journal" style={journalTheme}>
      <a className="journal-skip" href="#journal-content">{journal.labels.skip}</a>
      <JournalHeader />
      <main id="journal-content">
        <section className="journal-hero journal-shell">
          <div className="journal-introduction">
            <p className="journal-eyebrow"><span className="journal-dot" />{journal.hero.eyebrow}</p>
            <h1>{journal.hero.lines.map((line) => <span key={line}>{line}</span>)}</h1>
            <p className="journal-intro">{journal.hero.intro}</p>
            <a className="journal-text-link" href="/photos">{journal.hero.linkLabel} <span aria-hidden="true">↗</span></a>
          </div>
          <figure className="journal-cover">
            <a href="/photos" aria-label={journal.labels.photoGallery}>
              <img src={cover.large} srcSet={`${cover.preview} 1280w, ${cover.large} 2560w`} sizes="(max-width: 900px) calc(100vw - 40px), 65vw" width={cover.width} height={cover.height} alt={cover.alt} loading="eager" />
            </a>
            <figcaption><span>{journal.hero.photoLabel}</span><span>{cover.title} <span aria-hidden="true">↗</span></span></figcaption>
          </figure>
        </section>

        <section className="journal-writing journal-shell" id="writing">
          <div className="journal-section-heading">
            <p className="journal-eyebrow"><span>{journal.writing.number}</span>{journal.writing.label}</p>
            <div><h2>{journal.writing.title}</h2></div>
          </div>
          <a className="journal-essay" href={journal.writing.href}>
            <div className="journal-essay-copy">
              <p className="journal-eyebrow">{journal.writing.date} <span aria-hidden="true">·</span> {journal.writing.duration}</p>
              <h3>{journal.writing.headline}</h3>
              <p className="journal-essay-description">{journal.writing.description}</p>
              <span className="journal-text-link">{journal.writing.linkLabel}<span aria-hidden="true">↗</span></span>
            </div>
            <figure>
              <img src={essayPhoto.preview} width={essayPhoto.width} height={essayPhoto.height} alt={essayPhoto.alt} loading="lazy" decoding="async" />
            </figure>
          </a>
        </section>

        <section className="journal-photography" id="photography">
          <div className="journal-shell">
            <div className="journal-section-heading">
              <p className="journal-eyebrow"><span>{journal.photography.number}</span>{journal.photography.label}</p>
              <div><h2>{journal.photography.title}</h2><p>{journal.photography.description}</p></div>
            </div>
            <div className="journal-photo-selection">
              {photographs.map((photo, index) => (
                <a href={journal.photography.href} key={photo.id} aria-label={`${photo.title} — ${journal.labels.photoGallery}`}>
                  <figure>
                    <img src={photo.preview} srcSet={`${photo.small} 640w, ${photo.preview} 1280w`} sizes="(max-width: 700px) calc(100vw - 40px), 33vw" width={photo.width} height={photo.height} alt={photo.alt} loading="lazy" decoding="async" />
                    <figcaption><span>{photo.title}</span><span>{String(index + 1).padStart(2, "0")}</span></figcaption>
                  </figure>
                </a>
              ))}
            </div>
            <a className="journal-text-link" href={journal.photography.href}>{journal.photography.linkLabel}<span className="journal-photo-count">{photoCount}</span><span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section className="journal-about journal-shell" id="about">
          <div>
            <p className="journal-eyebrow"><span>{journal.about.number}</span>{journal.about.label}</p>
            <h2>{journal.about.title}</h2>
          </div>
          <div className="journal-about-copy">
            <p>{journal.about.description}</p>
            <div className="journal-contact-links">
              <a href={`mailto:${journal.about.email}`}>{journal.about.email} <span aria-hidden="true">↗</span></a>
              <a href={journal.about.github} target="_blank" rel="noreferrer">{journal.about.githubLabel} <span aria-hidden="true">↗</span></a>
            </div>
          </div>
        </section>

        <aside className="journal-orbit-note journal-shell">
          <a href={journal.orbit.href}>
            <span className="journal-orbit-emblem" aria-hidden="true"><span /><span /><span /></span>
            <div><p className="journal-eyebrow">{journal.orbit.eyebrow}</p><h2>{journal.orbit.title}</h2><p className="journal-orbit-description">{journal.orbit.description}</p></div>
            <span className="journal-orbit-action">{journal.orbit.label} <span aria-hidden="true">↗</span></span>
          </a>
        </aside>
      </main>
      <footer className="journal-footer journal-shell">
        <div><span>{journal.identity.name}</span><p>{journal.about.footer}</p></div>
        <span>© {journal.about.year}</span>
      </footer>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import gallery from "../data/photos.json";
import "../photos.css";

type Photo = (typeof gallery.photos)[number];

function PhotoImage({ photo, large = false, eager = false }: { photo: Photo; large?: boolean; eager?: boolean }) {
  return (
    <img
      src={large ? photo.large : photo.preview}
      srcSet={large ? undefined : `${photo.small} 640w, ${photo.preview} 1280w, ${photo.large} 2560w`}
      sizes={large ? undefined : "(max-width: 680px) calc(100vw - 32px), (max-width: 1400px) calc(50vw - 40px), 660px"}
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
      loading={eager || large ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

export function PhotosPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const current = selected === null ? null : gallery.photos[selected];

  useEffect(() => {
    document.title = gallery.page.title;
    const description = document.querySelector('meta[name="description"]');
    const previous = description?.getAttribute("content");
    description?.setAttribute("content", gallery.page.description);
    return () => {
      if (previous !== null && previous !== undefined) description?.setAttribute("content", previous);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected !== null && !dialog.open) dialog.showModal();
    if (selected === null && dialog.open) dialog.close();
  }, [selected]);

  const isOpen = selected !== null;
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const navigate = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelected((index) => index === null ? null : Math.min(gallery.photos.length - 1, index + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelected((index) => index === null ? null : Math.max(0, index - 1));
      }
    };
    window.addEventListener("keydown", navigate);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", navigate);
    };
  }, [isOpen]);

  return (
    <div className="photos-page">
      <nav className="photos-nav" aria-label="Photography navigation">
        <a className="photos-brand" href="/">{gallery.page.author}</a>
        <a className="photos-return" href="/">{gallery.labels.returnToOrbit} <span aria-hidden="true">↗</span></a>
      </nav>

      <main className="photos-main">
        <header className="photos-header">
          <div>
            <p className="photos-eyebrow">{gallery.page.eyebrow}</p>
            <h1>{gallery.page.heading}</h1>
          </div>
          <p className="photos-intro">{gallery.page.description}</p>
        </header>

        <div className="photos-collection-label">
          <span>{gallery.labels.selectedWork}</span>
          <span>{String(gallery.photos.length).padStart(2, "0")} {gallery.labels.photographs}</span>
        </div>

        <div className="photos-grid">
          {gallery.photos.filter((_, index) => index % 2 === 0).map((firstPhoto, rowIndex) => (
            <div className="photos-row" key={firstPhoto.id}>
              {gallery.photos.slice(rowIndex * 2, rowIndex * 2 + 2).map((photo, offset) => {
                const index = rowIndex * 2 + offset;
                return (
                  <figure className="photos-card" key={photo.id} style={{ flexGrow: photo.width / photo.height }}>
                    <button
                      type="button"
                      className="photos-open"
                      onClick={() => setSelected(index)}
                      aria-label={`${gallery.labels.openPhoto}: ${photo.title}`}
                      aria-haspopup="dialog"
                    >
                      <PhotoImage photo={photo} eager={index < 2} />
                      <span className="photos-expand" aria-hidden="true">↗</span>
                    </button>
                    <figcaption>
                      <span>{photo.title}</span>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ))}
        </div>
      </main>

      <footer className="photos-footer">
        <span>© {gallery.page.year} {gallery.page.author}</span>
        <a href="/">{gallery.labels.returnToOrbit} ↗</a>
      </footer>

      <dialog
        ref={dialogRef}
        className="photos-lightbox"
        aria-labelledby="photo-title"
        onCancel={() => setSelected(null)}
        onClose={() => setSelected(null)}
        onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}
      >
        {current && selected !== null ? (
          <div className="photos-lightbox-inner">
            <div className="photos-lightbox-top">
              <span>{gallery.page.author} <span className="photos-lightbox-slash">/</span> {gallery.page.heading}</span>
              <button type="button" className="photos-close" onClick={() => setSelected(null)} autoFocus aria-label={gallery.labels.close}>
                {gallery.labels.close} <span aria-hidden="true">×</span>
              </button>
            </div>
            <div
              className="photos-lightbox-image"
              onTouchStart={(event) => {
                if (event.touches.length === 1) touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
                else touchStart.current = null;
              }}
              onTouchEnd={(event) => {
                const start = touchStart.current;
                touchStart.current = null;
                if (!start || event.changedTouches.length !== 1) return;
                const dx = event.changedTouches[0].clientX - start.x;
                const dy = event.changedTouches[0].clientY - start.y;
                if (Math.abs(dx) > gallery.interaction.swipeThreshold && Math.abs(dx) > Math.abs(dy) * 2) {
                  setSelected(Math.max(0, Math.min(gallery.photos.length - 1, selected + (dx < 0 ? 1 : -1))));
                }
              }}
            >
              <PhotoImage key={current.id} photo={current} large />
            </div>
            <div className="photos-lightbox-bottom">
              <div className="photos-current" aria-live="polite" aria-atomic="true">
                <h2 id="photo-title">{current.title}</h2>
                <p>{String(selected + 1).padStart(2, "0")} / {String(gallery.photos.length).padStart(2, "0")}</p>
              </div>
              <div className="photos-navigation">
                <button type="button" disabled={selected === 0} onClick={() => setSelected(selected - 1)} aria-label={gallery.labels.previous}>←</button>
                <button type="button" disabled={selected === gallery.photos.length - 1} onClick={() => setSelected(selected + 1)} aria-label={gallery.labels.next}>→</button>
              </div>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

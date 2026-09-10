import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import { playground, playgroundPhotos, playgroundTheme } from "../data/playground";
import { PlaygroundIcon } from "./PlaygroundIcon";
import "../playground.css";

export function PhotoViewer({ selected, onSelect }: { selected: number | null; onSelect: Dispatch<SetStateAction<number | null>> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const current = selected === null ? null : playgroundPhotos[selected];
  const isOpen = selected !== null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      onSelect((index) => index === null ? null : Math.max(0, Math.min(playgroundPhotos.length - 1, index + direction)));
    };
    window.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", keydown); };
  }, [isOpen, onSelect]);
  return <dialog ref={dialogRef} className="playground-viewer" style={playgroundTheme} aria-labelledby="playground-photo-title" onCancel={() => onSelect(null)} onClose={() => onSelect(null)}>
    {current && selected !== null && <div className="playground-viewer-inner">
      <h2 className="playground-sr-only" id="playground-photo-title">{current.title}</h2>
      <button className="playground-control playground-viewer-close" type="button" autoFocus onClick={() => onSelect(null)} aria-label={playground.labels.close} title={playground.labels.close}><PlaygroundIcon name="close" /></button>
      <div className="playground-viewer-image" onClick={(event) => { if (event.target === event.currentTarget) onSelect(null); }}
        onTouchStart={(event) => { touchStart.current = event.touches.length === 1 ? { x:event.touches[0].clientX, y:event.touches[0].clientY } : null; }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start || event.changedTouches.length !== 1) return;
          const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > playground.interaction.swipeThreshold && Math.abs(dx) > Math.abs(dy) * 2) onSelect(Math.max(0, Math.min(playgroundPhotos.length - 1, selected + (dx < 0 ? 1 : -1))));
        }}>
        <img key={current.id} src={current.large} width={current.width} height={current.height} alt={current.alt} draggable={false} />
      </div>
      <nav className="playground-viewer-controls" aria-label={playground.labels.photos}>
        <button type="button" className="playground-control" disabled={selected === 0} onClick={() => onSelect(selected - 1)} aria-label={playground.labels.previous} title={playground.labels.previous}><PlaygroundIcon name="previous" /></button>
        <span aria-live="polite" aria-atomic="true">{String(selected + 1).padStart(2,"0")} <span>/</span> {playgroundPhotos.length}</span>
        <button type="button" className="playground-control" disabled={selected === playgroundPhotos.length - 1} onClick={() => onSelect(selected + 1)} aria-label={playground.labels.next} title={playground.labels.next}><PlaygroundIcon name="next" /></button>
      </nav>
    </div>}
  </dialog>;
}

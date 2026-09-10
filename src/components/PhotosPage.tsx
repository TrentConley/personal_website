import { type CSSProperties, useEffect, useState } from "react";
import gallery from "../data/photos.json";
import { playground, playgroundTheme } from "../data/playground";
import { PlaygroundHeader } from "./PlaygroundHeader";
import { SiteNavigation } from "./SiteNavigation";
import { PhotoViewer } from "./PhotoViewer";
import "../photos.css";
import "../playground.css";

const indexedPhotos = new Map(gallery.photos.map((photo, index) => [photo.id, { photo, index }]));
const groups = gallery.layout.groups.map((group) => ({
  ...group,
  sizes: gallery.layout.image_sizes[group.kind as keyof typeof gallery.layout.image_sizes],
  entries: group.photos.map((id) => {
    const entry = indexedPhotos.get(id);
    if (!entry) throw new Error(`Missing gallery photo: ${id}`);
    return entry;
  }),
}));

export function PhotosPage() {
  const [selected,setSelected] = useState<number|null>(null);
  useEffect(() => { document.title = gallery.page.title; },[]);
  return <div className="photos-page playground-gallery" style={{...playgroundTheme, ...gallery.layout.theme} as CSSProperties}>
    <PlaygroundHeader />
    <main className="photos-main">
      <h1 className="playground-sr-only">{playground.labels.photos}</h1>
      <div className="photos-grid">
        {groups.map((group)=>(
          <div className={`photos-row photos-row--${group.kind}`} key={group.photos.join("-")}>
            {group.entries.map(({photo,index})=>{
              return <figure className="photos-card" key={photo.id} style={{flexGrow:photo.width/photo.height}}>
                <button type="button" className="photos-open" onClick={()=>setSelected(index)} aria-label={`${gallery.labels.openPhoto}: ${photo.title}`} aria-haspopup="dialog">
                  <img src={photo.preview} srcSet={`${photo.small} 640w, ${photo.preview} 1280w, ${photo.large} 2560w`} sizes={group.sizes} style={{filter:photo.previewFilter}} width={photo.width} height={photo.height} alt={photo.alt} loading={index===0?"eager":"lazy"} decoding="async" />
                  <span className="playground-print-label">{photo.title}<span>↗</span></span>
                </button>
              </figure>;
            })}
          </div>
        ))}
      </div>
    </main>
    <SiteNavigation active="photos" />
    <PhotoViewer selected={selected} onSelect={setSelected} />
  </div>;
}

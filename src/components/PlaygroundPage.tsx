import { type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { playground, playgroundPhotos, playgroundTheme, scenePhotos, type PlaygroundSlot } from "../data/playground";
import { clampPosition, throwPosition, type Bounds, type Point } from "../lib/playground-motion";
import { PlaygroundHeader } from "./PlaygroundHeader";
import { PhotoViewer } from "./PhotoViewer";
import { SiteNavigation } from "./SiteNavigation";
import "../playground.css";

type Gesture = { id:string; pointerId:number; start:Point; origin:Point; last:Point; velocity:Point; time:number; moved:boolean; bounds:Bounds };
export function PlaygroundPage() {
  const [selected,setSelected] = useState<number|null>(null);
  const [offsets,setOffsets] = useState<Record<string,Point>>({});
  const [dragging,setDragging] = useState<string|null>(null);
  const [raised,setRaised] = useState<string|null>(null);
  const gesture = useRef<Gesture|null>(null);
  const suppressedClick = useRef<string|null>(null);
  const photos = scenePhotos;
  useEffect(() => {
    document.title = playground.identity.title;
  },[]);

  function boundsFor(element:HTMLElement, origin:Point): Bounds {
    const rect = element.getBoundingClientRect();
    return {
      minX:playground.interaction.visibleEdge - rect.right + origin.x,
      maxX:window.innerWidth - playground.interaction.visibleEdge - rect.left + origin.x,
      minY:playground.interaction.topBoundary + playground.interaction.visibleEdge - rect.bottom + origin.y,
      maxY:window.innerHeight - playground.interaction.bottomBoundary - rect.top + origin.y,
    };
  }

  function pointerDown(event:PointerEvent<HTMLElement>,id:string) {
    suppressedClick.current = null;
    if (event.button !== 0 || gesture.current) return;
    const origin = offsets[id] ?? {x:0,y:0};
    gesture.current = { id,pointerId:event.pointerId,start:{x:event.clientX,y:event.clientY},origin,last:{x:event.clientX,y:event.clientY},velocity:{x:0,y:0},time:performance.now(),moved:false,bounds:boundsFor(event.currentTarget,origin) };
    event.currentTarget.setPointerCapture(event.pointerId);
    setRaised(id);
  }

  function pointerMove(event:PointerEvent<HTMLElement>) {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX-drag.start.x, dy = event.clientY-drag.start.y;
    if (!drag.moved && Math.hypot(dx,dy)<playground.interaction.dragThreshold) return;
    drag.moved = true;
    setDragging(drag.id);
    const now = performance.now(), elapsed = now-drag.time;
    if (elapsed>0) drag.velocity = { x:(event.clientX-drag.last.x)/elapsed,y:(event.clientY-drag.last.y)/elapsed };
    drag.last = { x:event.clientX,y:event.clientY };
    drag.time = now;
    const position = clampPosition({x:drag.origin.x+dx,y:drag.origin.y+dy},drag.bounds);
    setOffsets(previous=>({...previous,[drag.id]:position}));
  }

  function pointerUp(event:PointerEvent<HTMLElement>) {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressedClick.current = drag.id;
      const position = clampPosition({x:drag.origin.x+event.clientX-drag.start.x,y:drag.origin.y+event.clientY-drag.start.y},drag.bounds);
      const velocity = performance.now()-drag.time > playground.interaction.throwMultiplier ? {x:0,y:0} : drag.velocity;
      const next = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? position : throwPosition(position,velocity,drag.bounds,playground.interaction.throwMultiplier,playground.interaction.maximumThrow);
      setOffsets(previous=>({...previous,[drag.id]:next}));
    }
    gesture.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancelPointer(event:PointerEvent<HTMLElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return;
    suppressedClick.current = gesture.current.id;
    gesture.current = null;
    setDragging(null);
  }

  function keyboardMove(event:KeyboardEvent<HTMLElement>,id:string) {
    if (!event.altKey || !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const origin = offsets[id] ?? {x:0,y:0};
    const step = playground.interaction.keyboardStep;
    const next = clampPosition({x:origin.x+(event.key==="ArrowRight"?step:event.key==="ArrowLeft"?-step:0),y:origin.y+(event.key==="ArrowDown"?step:event.key==="ArrowUp"?-step:0)},boundsFor(event.currentTarget,origin));
    setOffsets(previous=>({...previous,[id]:next}));
    setRaised(id);
  }

  function wasDrag(event:MouseEvent<HTMLElement>,id:string) {
    if (event.detail !== 0 && suppressedClick.current === id) { event.preventDefault(); suppressedClick.current = null; return true; }
    return false;
  }

  function itemStyle(id:string,slot:PlaygroundSlot,index:number):CSSProperties {
    const offset = offsets[id] ?? {x:0,y:0};
    return { "--x":`${slot.x}%`,"--y":`${slot.y}%`,"--w":`${slot.w}%`,"--r":`${slot.rotation}deg`,"--mx":`${slot.mx}%`,"--my":`${slot.my}%`,"--mw":`${slot.mw}%`,"--dx":`${offset.x}px`,"--dy":`${offset.y}px`,zIndex:raised===id?80:30-index } as CSSProperties;
  }

  function dragHandlers(id:string) {
    return { onPointerDown:(event:PointerEvent<HTMLElement>)=>pointerDown(event,id),onPointerMove:pointerMove,onPointerUp:pointerUp,onPointerCancel:cancelPointer,onLostPointerCapture:cancelPointer,onKeyDown:(event:KeyboardEvent<HTMLElement>)=>keyboardMove(event,id) };
  }

  return <div className="playground playground--scatter" style={playgroundTheme}>
    <PlaygroundHeader />
    <main className="playground-stage" aria-label={playground.labels.home}>
      <h1 className="playground-sr-only">{playground.identity.name} — {playground.labels.home}</h1>
      {photos.map((photo,index) => {
        const slot = playground.scene[index];
        return <button type="button" className={`playground-print${dragging===photo.id?" is-dragging":""}`} key={photo.id} aria-label={`${playground.labels.open}: ${photo.title}`} aria-haspopup="dialog" aria-describedby="playground-drag-help" style={itemStyle(photo.id,slot,index)} {...dragHandlers(photo.id)}
          onClick={(event)=>{ if (!wasDrag(event,photo.id)) setSelected(playgroundPhotos.findIndex(item=>item.id===photo.id)); }}>
          <img src={photo.preview} srcSet={`${photo.small} 640w, ${photo.preview} 1280w`} sizes="(max-width:700px) 50vw, 35vw" style={{filter:photo.previewFilter}} width={photo.width} height={photo.height} alt={photo.alt} draggable={false} loading="eager" />
          <span className="playground-print-label">{photo.title}<span>↗</span></span>
        </button>;
      })}
      <p className="playground-sr-only" id="playground-drag-help">{playground.labels.drag} {playground.labels.keyboardDrag}</p>
    </main>
    <SiteNavigation active="mix" />
    <PhotoViewer selected={selected} onSelect={setSelected} />
  </div>;
}

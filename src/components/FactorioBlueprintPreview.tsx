import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  ChainPlannedEntity,
  ChainPort,
  GeneratedChainBlueprint,
} from "../factorio/chain";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 8;
const VIEW_PADDING = 42;
const MACHINE_NAMES = new Set(["assembling-machine-3", "electric-furnace", "chemical-plant"]);
const imageCache = new Map<string, HTMLImageElement>();

interface Size {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface HoveredEntity {
  planned: ChainPlannedEntity;
  left: number;
  top: number;
}

function title(value: string): string {
  return value
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function footprint(planned: ChainPlannedEntity): Size {
  const { name, direction = 0 } = planned.entity;
  if (MACHINE_NAMES.has(name)) return { width: 3, height: 3 };
  if (name === "substation") return { width: 2, height: 2 };
  if (name.includes("splitter")) {
    return direction === 0 || direction === 8
      ? { width: 2, height: 1 }
      : { width: 1, height: 2 };
  }
  if (name === "pump") {
    return direction === 0 || direction === 8
      ? { width: 1, height: 2 }
      : { width: 2, height: 1 };
  }
  return { width: 1, height: 1 };
}

function calculateBounds(entities: ChainPlannedEntity[], ports: ChainPort[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const planned of entities) {
    const size = footprint(planned);
    minX = Math.min(minX, planned.entity.position.x - size.width / 2);
    maxX = Math.max(maxX, planned.entity.position.x + size.width / 2);
    minY = Math.min(minY, planned.entity.position.y - size.height / 2);
    maxY = Math.max(maxY, planned.entity.position.y + size.height / 2);
  }
  for (const port of ports) {
    minX = Math.min(minX, port.position.x - 0.5);
    maxX = Math.max(maxX, port.position.x + 0.5);
    minY = Math.min(minY, port.position.y - 0.5);
    maxY = Math.max(maxY, port.position.y + 0.5);
  }
  if (!Number.isFinite(minX)) return {
    minX: -1,
    maxX: 1,
    minY: -1,
    maxY: 1,
    width: 2,
    height: 2,
    centerX: 0,
    centerY: 0,
  };
  const margin = 3;
  minX -= margin;
  maxX += margin;
  minY -= margin;
  maxY += margin;
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function materialColor(material: string | undefined): string {
  if (!material) return "#9ba59c";
  let hash = 0;
  for (let index = 0; index < material.length; index += 1) {
    hash = ((hash << 5) - hash + material.charCodeAt(index)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue} 52% 59%)`;
}

function beltColor(name: string): string {
  if (name.startsWith("express-")) return "#3c91bd";
  if (name.startsWith("fast-")) return "#c85e5d";
  return "#c7a84c";
}

function roleOrder(role: ChainPlannedEntity["role"]): number {
  if (role === "pipe" || role === "material-bus" || role === "input-belt" || role === "output-belt") return 0;
  if (role === "ingredient-branch" || role === "ingredient-feeder") return 1;
  if (role === "underground-belt" || role === "pipe-to-ground" || role === "splitter") return 2;
  if (role === "input-inserter" || role === "output-inserter") return 3;
  if (role === "machine") return 4;
  return 5;
}

function loadIcon(name: string): Promise<void> {
  let image = imageCache.get(name);
  if (!image) {
    image = new Image();
    image.src = `/factorio-icons/${name}.png`;
    imageCache.set(name, image);
  }
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image?.addEventListener("load", () => resolve(), { once: true });
    image?.addEventListener("error", () => resolve(), { once: true });
  });
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const resolvedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, resolvedRadius);
}

function drawIcon(
  context: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  opacity = 1,
): void {
  const image = imageCache.get(name);
  if (!image?.complete || image.naturalWidth === 0) return;
  context.save();
  context.globalAlpha = opacity;
  context.drawImage(image, 0, 0, 64, 64, x - size / 2, y - size / 2, size, size);
  context.restore();
}

function drawDirection(
  context: CanvasRenderingContext2D,
  direction: number,
  radius: number,
  color: string,
): void {
  context.save();
  context.rotate(direction * Math.PI / 8);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, -radius);
  context.lineTo(radius * 0.62, radius * 0.34);
  context.lineTo(-radius * 0.62, radius * 0.34);
  context.closePath();
  context.fill();
  context.restore();
}

function drawEntity(
  context: CanvasRenderingContext2D,
  planned: ChainPlannedEntity,
  pixelsPerTile: number,
): void {
  const { entity, role, material } = planned;
  const size = footprint(planned);
  const width = size.width * 0.88;
  const height = size.height * 0.88;
  const materialTint = materialColor(material);
  const line = Math.max(0.08, 1 / pixelsPerTile);
  const transportRole = role === "input-belt"
    || role === "material-bus"
    || role === "ingredient-branch"
    || role === "ingredient-feeder"
    || role === "output-belt";

  context.save();
  context.translate(entity.position.x, entity.position.y);

  if (entity.name === "pipe") {
    context.strokeStyle = "#6f9694";
    context.lineWidth = 0.42;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(-0.47, 0);
    context.lineTo(0.47, 0);
    context.moveTo(0, -0.47);
    context.lineTo(0, 0.47);
    context.stroke();
    context.fillStyle = materialTint;
    context.beginPath();
    context.arc(0, 0, 0.12, 0, Math.PI * 2);
    context.fill();
  } else if (transportRole) {
    drawRoundedRect(context, -width / 2, -height / 2, width, height, 0.16);
    context.fillStyle = beltColor(entity.name);
    context.fill();
    context.strokeStyle = "rgba(7, 11, 8, 0.72)";
    context.lineWidth = line;
    context.stroke();
    context.fillStyle = materialTint;
    context.globalAlpha = 0.78;
    context.fillRect(-width * 0.36, -height * 0.36, width * 0.16, height * 0.72);
    context.globalAlpha = 1;
    drawDirection(context, entity.direction ?? 0, 0.23, "rgba(245, 242, 221, 0.86)");
  } else if (role === "input-inserter" || role === "output-inserter") {
    context.strokeStyle = role === "input-inserter" ? "#d8c564" : "#8bcf9e";
    context.lineWidth = 0.18;
    context.beginPath();
    context.arc(0, 0, 0.29, 0, Math.PI * 2);
    context.stroke();
    drawDirection(context, entity.direction ?? 0, 0.22, context.strokeStyle.toString());
    if (pixelsPerTile >= 13) drawIcon(context, entity.name, 0, 0, 0.68, 0.82);
  } else {
    const isMachine = role === "machine";
    const isPower = role === "power-pole";
    const fill = isMachine
      ? "#263129"
      : isPower
        ? "#23343a"
        : role === "pipe-to-ground"
          ? "#4f7574"
          : beltColor(entity.name);
    drawRoundedRect(context, -width / 2, -height / 2, width, height, isMachine ? 0.28 : 0.17);
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = isMachine ? materialTint : "rgba(224, 231, 220, 0.42)";
    context.lineWidth = isMachine ? Math.max(0.1, 1.5 / pixelsPerTile) : line;
    context.stroke();

    if (isMachine) {
      context.fillStyle = "rgba(4, 7, 5, 0.3)";
      drawRoundedRect(context, -width * 0.38, -height * 0.38, width * 0.76, height * 0.76, 0.2);
      context.fill();
      drawIcon(context, entity.name, 0, 0, Math.min(width, height) * 0.62, 0.94);
      if (material && pixelsPerTile >= 6) {
        context.fillStyle = "rgba(7, 10, 8, 0.88)";
        context.beginPath();
        context.arc(width * 0.3, height * 0.3, 0.32, 0, Math.PI * 2);
        context.fill();
        drawIcon(context, material, width * 0.3, height * 0.3, 0.48, 1);
      }
    } else {
      if (pixelsPerTile >= 7 || isPower || role === "splitter") {
        drawIcon(context, entity.name, 0, 0, Math.min(width, height) * 0.72, 0.9);
      }
      if (role === "underground-belt" || role === "pipe-to-ground" || role === "splitter" || entity.name === "pump") {
        drawDirection(context, entity.direction ?? 0, Math.min(width, height) * 0.24, "rgba(246, 244, 228, 0.88)");
      }
    }
  }
  context.restore();
}

function drawPort(
  context: CanvasRenderingContext2D,
  port: ChainPort,
  screen: Point,
  input: boolean,
): void {
  const color = input ? "#e6ad58" : "#82d29c";
  context.save();
  context.translate(screen.x, screen.y);
  context.fillStyle = "rgba(10, 14, 11, 0.94)";
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, 7, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  drawIcon(context, port.material, 0, 0, 11, 1);
  context.restore();
}

function compactRole(role: ChainPlannedEntity["role"]): string {
  if (role === "machine") return "Production machine";
  if (role === "power-pole") return "Power coverage";
  if (role === "input-inserter") return "Input inserter";
  if (role === "output-inserter") return "Output inserter";
  if (role === "input-belt") return "Factory input";
  if (role === "output-belt") return "Factory output";
  return title(role);
}

export function FactorioBlueprintPreview({ blueprint }: { blueprint: GeneratedChainBlueprint }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<null | { pointerId: number; x: number; y: number; pan: Point; moved: boolean }>(null);
  const [viewport, setViewport] = useState<Size>({ width: 760, height: 480 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [hovered, setHovered] = useState<HoveredEntity | null>(null);
  const [iconRevision, setIconRevision] = useState(0);

  const ports = useMemo(
    () => [...blueprint.inputPorts, blueprint.outputPort],
    [blueprint.inputPorts, blueprint.outputPort],
  );
  const bounds = useMemo(
    () => calculateBounds(blueprint.entities, ports),
    [blueprint.entities, ports],
  );
  const orderedEntities = useMemo(
    () => [...blueprint.entities].sort((left, right) => roleOrder(left.role) - roleOrder(right.role)),
    [blueprint.entities],
  );
  const iconNames = useMemo(() => [...new Set([
    ...blueprint.entities.flatMap((planned) => [planned.entity.name, planned.material]
      .filter((name): name is string => Boolean(name) && !name?.includes("+"))),
    ...ports.map((port) => port.material),
  ])], [blueprint.entities, ports]);
  const fitScale = useMemo(() => Math.max(
    0.08,
    Math.min(
      (viewport.width - VIEW_PADDING * 2) / bounds.width,
      (viewport.height - VIEW_PADDING * 2) / bounds.height,
    ),
  ), [bounds, viewport]);
  const pixelsPerTile = fitScale * zoom;
  const machineCount = useMemo(
    () => blueprint.entities.filter((planned) => planned.role === "machine").length,
    [blueprint.entities],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const updateSize = () => setViewport({
      width: Math.max(280, Math.round(container.clientWidth)),
      height: Math.max(340, Math.round(container.clientHeight)),
    });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all(iconNames.map(loadIcon)).then(() => {
      if (active) setIconRevision((revision) => revision + 1);
    });
    return () => { active = false; };
  }, [iconNames]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setHovered(null);
  }, [blueprint.blueprintString]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const density = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(viewport.width * density);
    canvas.height = Math.round(viewport.height * density);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.fillStyle = "#0b100c";
    context.fillRect(0, 0, viewport.width, viewport.height);

    const originX = viewport.width / 2 + pan.x;
    const originY = viewport.height / 2 + pan.y;
    const worldToScreen = (point: Point): Point => ({
      x: originX + (point.x - bounds.centerX) * pixelsPerTile,
      y: originY + (point.y - bounds.centerY) * pixelsPerTile,
    });

    context.save();
    context.translate(originX, originY);
    context.scale(pixelsPerTile, pixelsPerTile);
    context.translate(-bounds.centerX, -bounds.centerY);

    const gridStep = pixelsPerTile >= 8 ? 1 : pixelsPerTile >= 3 ? 4 : 8;
    context.lineWidth = Math.max(0.035, 0.6 / pixelsPerTile);
    context.strokeStyle = "rgba(203, 216, 202, 0.07)";
    context.beginPath();
    for (let x = Math.floor(bounds.minX / gridStep) * gridStep; x <= bounds.maxX; x += gridStep) {
      context.moveTo(x, bounds.minY);
      context.lineTo(x, bounds.maxY);
    }
    for (let y = Math.floor(bounds.minY / gridStep) * gridStep; y <= bounds.maxY; y += gridStep) {
      context.moveTo(bounds.minX, y);
      context.lineTo(bounds.maxX, y);
    }
    context.stroke();

    context.strokeStyle = "rgba(130, 210, 156, 0.12)";
    context.lineWidth = Math.max(0.06, 1 / pixelsPerTile);
    context.setLineDash([1.2, 1.2]);
    context.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    context.setLineDash([]);

    for (const planned of orderedEntities) drawEntity(context, planned, pixelsPerTile);
    context.restore();

    for (const port of blueprint.inputPorts) drawPort(context, port, worldToScreen(port.position), true);
    drawPort(context, blueprint.outputPort, worldToScreen(blueprint.outputPort.position), false);
  }, [blueprint, bounds, iconRevision, orderedEntities, pan, pixelsPerTile, viewport]);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setHovered(null);
  };

  const adjustZoom = (factor: number) => {
    setZoom((current) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor));
      const ratio = next / current;
      setPan((currentPan) => ({ x: currentPan.x * ratio, y: currentPan.y * ratio }));
      return next;
    });
  };

  const updateHover = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const local = { x: clientX - rect.left, y: clientY - rect.top };
    const world = {
      x: bounds.centerX + (local.x - viewport.width / 2 - pan.x) / pixelsPerTile,
      y: bounds.centerY + (local.y - viewport.height / 2 - pan.y) / pixelsPerTile,
    };
    const tolerance = Math.max(0.16, 4 / pixelsPerTile);
    let match: ChainPlannedEntity | undefined;
    for (let index = orderedEntities.length - 1; index >= 0; index -= 1) {
      const planned = orderedEntities[index];
      const size = footprint(planned);
      if (Math.abs(planned.entity.position.x - world.x) <= size.width / 2 + tolerance
        && Math.abs(planned.entity.position.y - world.y) <= size.height / 2 + tolerance) {
        match = planned;
        break;
      }
    }
    if (!match) {
      setHovered(null);
      return;
    }
    setHovered({
      planned: match,
      left: Math.max(10, Math.min(viewport.width - 215, local.x + 14)),
      top: Math.max(10, Math.min(viewport.height - 88, local.y + 14)),
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pan,
      moved: false,
    };
    setIsPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      updateHover(event.clientX, event.clientY);
      return;
    }
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) drag.moved = true;
    setPan({ x: drag.pan.x + deltaX, y: drag.pan.y + deltaY });
    setHovered(null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsPanning(false);
    if (!drag?.moved) updateHover(event.clientX, event.clientY);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    adjustZoom(event.deltaY < 0 ? 1.18 : 1 / 1.18);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const panStep = event.shiftKey ? 60 : 24;
    if (event.key === "+" || event.key === "=") adjustZoom(1.25);
    else if (event.key === "-") adjustZoom(0.8);
    else if (event.key === "0") resetView();
    else if (event.key === "ArrowLeft") setPan((current) => ({ ...current, x: current.x + panStep }));
    else if (event.key === "ArrowRight") setPan((current) => ({ ...current, x: current.x - panStep }));
    else if (event.key === "ArrowUp") setPan((current) => ({ ...current, y: current.y + panStep }));
    else if (event.key === "ArrowDown") setPan((current) => ({ ...current, y: current.y - panStep }));
    else return;
    event.preventDefault();
  };

  return (
    <section className="factorio-preview" aria-labelledby="factorio-preview-heading">
      <div className="factorio-preview__heading">
        <div>
          <small>Plan view</small>
          <h3 id="factorio-preview-heading">Blueprint preview</h3>
          <p>{blueprint.entities.length.toLocaleString()} placed entities · {machineCount.toLocaleString()} machines</p>
        </div>
        <div className="factorio-preview__controls" aria-label="Blueprint preview controls">
          <button type="button" onClick={() => adjustZoom(0.8)} aria-label="Zoom blueprint out">−</button>
          <output aria-label="Blueprint zoom">{Math.round(zoom * 100)}%</output>
          <button type="button" onClick={() => adjustZoom(1.25)} aria-label="Zoom blueprint in">+</button>
          <button type="button" className="factorio-preview__fit" onClick={resetView}>Fit</button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`factorio-preview__viewport${isPanning ? " is-panning" : ""}`}
        role="img"
        aria-label={`Plan view of the generated ${title(blueprint.plan.target)} blueprint with ${blueprint.entities.length} entities. Drag to pan and use the controls to zoom.`}
        tabIndex={0}
        onDoubleClick={resetView}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => { if (!dragRef.current) setHovered(null); }}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} />
        {hovered && (
          <div className="factorio-preview__tooltip" style={{ left: hovered.left, top: hovered.top }}>
            <strong>{title(hovered.planned.entity.name)}</strong>
            <span>{compactRole(hovered.planned.role)}</span>
            {hovered.planned.material && <small>Carrying / making {title(hovered.planned.material)}</small>}
          </div>
        )}
      </div>

      <div className="factorio-preview__legend">
        <span><i className="is-input" />Input ports</span>
        <span><i className="is-output" />Output port</span>
        <span><i className="is-material" />Material flow</span>
        <span><i className="is-machine" />Machines</span>
        <small>Drag to pan · scroll to zoom · hover to inspect</small>
      </div>
    </section>
  );
}

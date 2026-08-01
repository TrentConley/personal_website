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
const SPRITE_ROOT = "/factorio-entity-sprites";
const ICON_ROOT = "/factorio-icons";
const GROUND_TEXTURE = `${SPRITE_ROOT}/concrete.png`;

type DirectionName = "north" | "east" | "south" | "west";

interface SpriteSpec {
  path: string;
  width: number;
  height: number;
  shiftX?: number;
  shiftY?: number;
}

interface EntityRenderData {
  underlays?: SpriteSpec[];
  main?: SpriteSpec;
  overlay?: SpriteSpec;
  shadow?: SpriteSpec;
}

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

const DIRECTION_NAMES: Record<number, DirectionName> = {
  0: "north",
  4: "east",
  8: "south",
  12: "west",
};

const DIRECTION_VECTORS: Record<number, Point> = {
  0: { x: 0, y: -1 },
  4: { x: 1, y: 0 },
  8: { x: 0, y: 1 },
  12: { x: -1, y: 0 },
};

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

function roleOrder(role: ChainPlannedEntity["role"]): number {
  if (role === "pipe" || role === "material-bus" || role === "input-belt" || role === "output-belt") return 0;
  if (role === "ingredient-branch" || role === "ingredient-feeder") return 1;
  if (role === "underground-belt" || role === "pipe-to-ground" || role === "splitter") return 2;
  if (role === "input-inserter" || role === "output-inserter") return 3;
  if (role === "machine") return 4;
  return 5;
}

function directionName(direction = 0): DirectionName {
  return DIRECTION_NAMES[direction] ?? "north";
}

function positionKey(point: Point): string {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}

function isBelt(planned: ChainPlannedEntity | undefined): boolean {
  return Boolean(planned?.entity.name.endsWith("transport-belt"));
}

function spriteSpec(
  path: string,
  sourceWidth: number,
  sourceHeight: number,
  scale = 0.5,
  shiftPixelsX = 0,
  shiftPixelsY = 0,
): SpriteSpec {
  return {
    path: `${SPRITE_ROOT}/${path}.png`,
    width: sourceWidth * scale / 32,
    height: sourceHeight * scale / 32,
    shiftX: shiftPixelsX / 32,
    shiftY: shiftPixelsY / 32,
  };
}

function shiftedSprite(spec: SpriteSpec, x: number, y: number): SpriteSpec {
  return {
    ...spec,
    shiftX: (spec.shiftX ?? 0) + x,
    shiftY: (spec.shiftY ?? 0) + y,
  };
}

function relatedBeltName(entityName: string): string {
  if (entityName.startsWith("express-")) return "express-transport-belt";
  if (entityName.startsWith("fast-")) return "fast-transport-belt";
  return "transport-belt";
}

function incomingSideLoad(
  planned: ChainPlannedEntity,
  entitiesAtPosition: Map<string, ChainPlannedEntity>,
): boolean {
  const currentDirection = planned.entity.direction ?? 0;
  for (const incomingDirection of [0, 4, 8, 12]) {
    if (incomingDirection === currentDirection || incomingDirection === (currentDirection + 8) % 16) continue;
    const vector = DIRECTION_VECTORS[incomingDirection];
    const candidate = entitiesAtPosition.get(positionKey({
      x: planned.entity.position.x - vector.x,
      y: planned.entity.position.y - vector.y,
    }));
    if (isBelt(candidate)
      && candidate?.entity.direction === incomingDirection
      && candidate.material === planned.material) return true;
  }
  return false;
}

function outgoingSideLoad(
  planned: ChainPlannedEntity,
  entitiesAtPosition: Map<string, ChainPlannedEntity>,
): boolean {
  const currentDirection = planned.entity.direction ?? 0;
  const vector = DIRECTION_VECTORS[currentDirection];
  const candidate = entitiesAtPosition.get(positionKey({
    x: planned.entity.position.x + vector.x,
    y: planned.entity.position.y + vector.y,
  }));
  const candidateDirection = candidate?.entity.direction;
  return isBelt(candidate)
    && candidate?.material === planned.material
    && candidateDirection !== undefined
    && candidateDirection !== currentDirection
    && candidateDirection !== (currentDirection + 8) % 16;
}

function loadAsset(path: string): Promise<void> {
  let image = imageCache.get(path);
  if (!image) {
    image = new Image();
    image.src = path;
    imageCache.set(path, image);
  }
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image?.addEventListener("load", () => resolve(), { once: true });
    image?.addEventListener("error", () => resolve(), { once: true });
  });
}

function drawSprite(
  context: CanvasRenderingContext2D,
  spec: SpriteSpec,
  opacity = 1,
): void {
  const image = imageCache.get(spec.path);
  if (!image?.complete || image.naturalWidth === 0) return;
  context.save();
  context.globalAlpha = opacity;
  context.drawImage(
    image,
    -(spec.width / 2) + (spec.shiftX ?? 0),
    -(spec.height / 2) + (spec.shiftY ?? 0),
    spec.width,
    spec.height,
  );
  context.restore();
}

function drawIcon(
  context: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  opacity = 1,
): void {
  const image = imageCache.get(`${ICON_ROOT}/${name}.png`);
  if (!image?.complete || image.naturalWidth === 0) return;
  context.save();
  context.globalAlpha = opacity;
  context.drawImage(image, 0, 0, 64, 64, x - size / 2, y - size / 2, size, size);
  context.restore();
}

function beltShape(
  planned: ChainPlannedEntity,
  entitiesAtPosition: Map<string, ChainPlannedEntity>,
): string {
  const currentDirection = planned.entity.direction ?? 0;
  const currentName = directionName(currentDirection);
  for (const incomingDirection of [0, 4, 8, 12]) {
    if (incomingDirection === currentDirection || incomingDirection === (currentDirection + 8) % 16) continue;
    const vector = DIRECTION_VECTORS[incomingDirection];
    const candidate = entitiesAtPosition.get(positionKey({
      x: planned.entity.position.x - vector.x,
      y: planned.entity.position.y - vector.y,
    }));
    if (isBelt(candidate)
      && candidate?.entity.direction === incomingDirection
      && candidate.material === planned.material) {
      return `${directionName(incomingDirection)}-to-${currentName}`;
    }
  }
  return currentName;
}

const PIPE_SPRITES: Record<number, string> = {
  0: "pipe-straight-vertical-single",
  1: "pipe-ending-up",
  2: "pipe-ending-right",
  3: "pipe-corner-up-right",
  4: "pipe-ending-down",
  5: "pipe-straight-vertical",
  6: "pipe-corner-down-right",
  7: "pipe-t-right",
  8: "pipe-ending-left",
  9: "pipe-corner-up-left",
  10: "pipe-straight-horizontal",
  11: "pipe-t-up",
  12: "pipe-corner-down-left",
  13: "pipe-t-left",
  14: "pipe-t-down",
  15: "pipe-cross",
};

function pipeSpriteName(
  planned: ChainPlannedEntity,
  entitiesAtPosition: Map<string, ChainPlannedEntity>,
): string {
  let mask = 0;
  for (const [direction, bit] of [[0, 1], [4, 2], [8, 4], [12, 8]] as const) {
    const vector = DIRECTION_VECTORS[direction];
    const candidate = entitiesAtPosition.get(positionKey({
      x: planned.entity.position.x + vector.x,
      y: planned.entity.position.y + vector.y,
    }));
    const fluidEntity = candidate?.entity.name === "pipe"
      || candidate?.entity.name === "pipe-to-ground"
      || candidate?.entity.name === "pump";
    if (fluidEntity && candidate?.material === planned.material) mask |= bit;
  }
  return PIPE_SPRITES[mask] ?? PIPE_SPRITES[0];
}

function renderDataFor(
  planned: ChainPlannedEntity,
  entitiesAtPosition: Map<string, ChainPlannedEntity>,
): EntityRenderData {
  const { entity } = planned;
  const direction = directionName(entity.direction);

  if (isBelt(planned)) {
    return { main: spriteSpec(`${entity.name}-${beltShape(planned, entitiesAtPosition)}`, 128, 128) };
  }
  if (entity.name.endsWith("underground-belt")) {
    const beltType = entity.type === "input" ? "input" : "output";
    const sideLoading = beltType === "input"
      ? incomingSideLoad(planned, entitiesAtPosition)
      : outgoingSideLoad(planned, entitiesAtPosition);
    return {
      underlays: [spriteSpec(`${relatedBeltName(entity.name)}-${direction}`, 128, 128)],
      main: spriteSpec(
        `${entity.name}-${beltType}${sideLoading ? "-side" : ""}-${direction}`,
        192,
        192,
      ),
    };
  }
  if (entity.name.endsWith("splitter")) {
    const expressWest = entity.name === "express-splitter" && direction === "west";
    const dimensions: Record<DirectionName, [number, number, number, number]> = {
      north: [160, 70, 7, 0],
      east: [90, 84, 4, 13],
      south: [164, 64, 4, 0],
      west: [expressWest ? 94 : 90, 86, expressWest ? 5 : 6, 12],
    };
    const [width, height, shiftX, shiftY] = dimensions[direction];
    const belt = spriteSpec(`${relatedBeltName(entity.name)}-${direction}`, 128, 128);
    const laneOffsets = direction === "north" || direction === "south"
      ? [[-0.5, 0], [0.5, 0]]
      : [[0, -0.5], [0, 0.5]];
    const patchDimensions = direction === "east"
      ? [90, 104, 4, -20] as const
      : direction === "west"
        ? [expressWest ? 94 : 90, 96, expressWest ? 5 : 6, -18] as const
        : undefined;
    return {
      underlays: laneOffsets.map(([x, y]) => shiftedSprite(belt, x, y)),
      main: spriteSpec(`${entity.name}-${direction}`, width, height, 0.5, shiftX, shiftY),
      overlay: patchDimensions
        ? spriteSpec(
            `${entity.name}-${direction}-top-patch`,
            patchDimensions[0],
            patchDimensions[1],
            0.5,
            patchDimensions[2],
            patchDimensions[3],
          )
        : undefined,
    };
  }
  if (entity.name === "pipe") {
    const spriteName = pipeSpriteName(planned, entitiesAtPosition);
    const single = spriteName === "pipe-straight-vertical-single";
    return { main: spriteSpec(spriteName, single ? 160 : 128, single ? 160 : 128) };
  }
  if (entity.name === "pipe-to-ground") {
    const fileDirection = { north: "up", east: "right", south: "down", west: "left" }[direction];
    return { main: spriteSpec(`pipe-to-ground-${fileDirection}`, 128, 128) };
  }
  if (entity.name === "pump") {
    const dimensions: Record<DirectionName, [number, number, number, number]> = {
      north: [103, 164, 8, -0.85],
      east: [130, 109, -0.5, 1.75],
      south: [114, 160, 12.5, -8],
      west: [131, 111, -0.25, 1.25],
    };
    const [width, height, shiftX, shiftY] = dimensions[direction];
    return { main: spriteSpec(`pump-${direction}`, width, height, 0.5, shiftX, shiftY) };
  }
  if (entity.name === "bulk-inserter" || entity.name === "long-handed-inserter") {
    return { main: spriteSpec(`${entity.name}-${direction}`, 105, 79, 0.5, 1.5, 6.5) };
  }
  if (entity.name === "assembling-machine-3") {
    return {
      main: spriteSpec("assembling-machine-3", 214, 237, 0.5, 0, -0.75),
      shadow: spriteSpec("assembling-machine-3-shadow", 260, 162, 0.5, 28, 4),
    };
  }
  if (entity.name === "electric-furnace") {
    return {
      main: spriteSpec("electric-furnace", 239, 219, 0.5, 0.75, 5.75),
      shadow: spriteSpec("electric-furnace-shadow", 227, 171, 0.5, 11.25, 7.75),
    };
  }
  if (entity.name === "chemical-plant") {
    return {
      main: spriteSpec(`chemical-plant-${direction}`, 220, 292, 0.5, 0.5, -9),
      shadow: spriteSpec("chemical-plant-shadow", 312, 222, 0.5, 27, 6),
    };
  }
  if (entity.name === "substation") {
    return {
      main: spriteSpec("substation", 138, 270, 0.5, 0, -31),
      shadow: spriteSpec("substation-shadow", 370, 104, 0.5, 62, 10),
    };
  }
  return {};
}

function drawInserterArm(
  context: CanvasRenderingContext2D,
  planned: ChainPlannedEntity,
): void {
  const vector = DIRECTION_VECTORS[planned.entity.direction ?? 0];
  const long = planned.entity.name === "long-handed-inserter";
  const reach = long ? 1.75 : 0.85;
  context.save();
  context.lineCap = "round";
  context.strokeStyle = long ? "#c94e3f" : "#62b856";
  context.lineWidth = long ? 0.13 : 0.15;
  context.beginPath();
  context.moveTo(-vector.x * reach * 0.55, -vector.y * reach * 0.55);
  context.lineTo(vector.x * reach, vector.y * reach);
  context.stroke();
  context.fillStyle = "#d6d0a9";
  context.beginPath();
  context.arc(vector.x * reach, vector.y * reach, 0.13, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawEntity(
  context: CanvasRenderingContext2D,
  planned: ChainPlannedEntity,
  pixelsPerTile: number,
  renderData: EntityRenderData,
): void {
  const { entity, role, material } = planned;
  context.save();
  context.translate(entity.position.x, entity.position.y);

  if (pixelsPerTile < 0.35 || !renderData.main) {
    const size = footprint(planned);
    context.fillStyle = role === "machine"
      ? "#c99657"
      : role === "power-pole"
        ? "#77a6ad"
        : entity.name === "pipe" || entity.name === "pipe-to-ground"
          ? "#a6b7b6"
          : "#7894a6";
    context.fillRect(-size.width * 0.42, -size.height * 0.42, size.width * 0.84, size.height * 0.84);
  } else {
    if (renderData.shadow) drawSprite(context, renderData.shadow, 0.72);
    for (const underlay of renderData.underlays ?? []) drawSprite(context, underlay);
    drawSprite(context, renderData.main);
    if (renderData.overlay) drawSprite(context, renderData.overlay);
    if (role === "input-inserter" || role === "output-inserter") drawInserterArm(context, planned);
    if (isBelt(planned) && material && entity.entity_number % 6 === 0 && pixelsPerTile >= 4.5) {
      context.fillStyle = "rgba(17, 20, 16, 0.78)";
      context.beginPath();
      context.arc(0, 0, 0.27, 0, Math.PI * 2);
      context.fill();
      drawIcon(context, material, 0, 0, 0.47, 0.98);
    }
    if (role === "machine" && material && pixelsPerTile >= 4.5) {
      context.fillStyle = "rgba(12, 16, 12, 0.9)";
      context.beginPath();
      context.arc(1.03, 1.03, 0.34, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(226, 231, 217, 0.56)";
      context.lineWidth = Math.max(0.06, 1 / pixelsPerTile);
      context.stroke();
      drawIcon(context, material, 1.03, 1.03, 0.54);
    }
  }
  context.restore();
}

function drawPowerConnections(
  context: CanvasRenderingContext2D,
  entities: ChainPlannedEntity[],
  pixelsPerTile: number,
): void {
  const substations = entities.filter((planned) => planned.entity.name === "substation");
  context.save();
  context.lineCap = "round";
  for (let leftIndex = 0; leftIndex < substations.length; leftIndex += 1) {
    const left = substations[leftIndex].entity.position;
    for (let rightIndex = leftIndex + 1; rightIndex < substations.length; rightIndex += 1) {
      const right = substations[rightIndex].entity.position;
      const deltaX = right.x - left.x;
      const deltaY = right.y - left.y;
      const distance = Math.hypot(deltaX, deltaY);
      const aligned = Math.abs(deltaX) <= 3 || Math.abs(deltaY) <= 3;
      if (distance > 18.2 || !aligned) continue;
      context.strokeStyle = "rgba(35, 20, 12, 0.7)";
      context.lineWidth = Math.max(0.08, 2 / pixelsPerTile);
      context.beginPath();
      context.moveTo(left.x, left.y - 1.2);
      context.lineTo(right.x, right.y - 1.2);
      context.stroke();
      context.strokeStyle = "rgba(190, 126, 63, 0.82)";
      context.lineWidth = Math.max(0.035, 0.85 / pixelsPerTile);
      context.stroke();
    }
  }
  context.restore();
}

function drawGround(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.fillStyle = "#29332b";
  context.fillRect(0, 0, width, height);
  const texture = imageCache.get(GROUND_TEXTURE);
  if (texture?.complete && texture.naturalWidth > 0) {
    context.save();
    context.globalAlpha = 0.14;
    const textureSize = 256;
    for (let y = 0; y < height; y += textureSize) {
      for (let x = 0; x < width; x += textureSize) {
        context.drawImage(texture, 0, 0, 512, 512, x, y, textureSize, textureSize);
      }
    }
    context.restore();
  }
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
  const [assetRevision, setAssetRevision] = useState(0);
  const [expanded, setExpanded] = useState(false);

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
  const entitiesAtPosition = useMemo(
    () => new Map(blueprint.entities.map((planned) => [positionKey(planned.entity.position), planned])),
    [blueprint.entities],
  );
  const entityRenderData = useMemo(
    () => new Map(blueprint.entities.map((planned) => [
      planned.entity.entity_number,
      renderDataFor(planned, entitiesAtPosition),
    ])),
    [blueprint.entities, entitiesAtPosition],
  );
  const assetPaths = useMemo(() => [...new Set([
    GROUND_TEXTURE,
    ...[...entityRenderData.values()].flatMap((data) => [
      ...(data.underlays ?? []).map((underlay) => underlay.path),
      data.main?.path,
      data.overlay?.path,
      data.shadow?.path,
    ]
      .filter((path): path is string => Boolean(path))),
    ...blueprint.entities.map((planned) => planned.material)
      .filter((name): name is string => Boolean(name) && !name?.includes("+"))
      .map((name) => `${ICON_ROOT}/${name}.png`),
    ...ports.map((port) => `${ICON_ROOT}/${port.material}.png`),
  ])], [blueprint.entities, entityRenderData, ports]);
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
    void Promise.all(assetPaths.map(loadAsset)).then(() => {
      if (active) setAssetRevision((revision) => revision + 1);
    });
    return () => { active = false; };
  }, [assetPaths]);

  useEffect(() => {
    if (!expanded) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.body.classList.add("factorio-preview-open");
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("factorio-preview-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

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
    drawGround(context, viewport.width, viewport.height);

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

    const gridStep = pixelsPerTile >= 2.5 ? 1 : pixelsPerTile >= 1 ? 4 : 8;
    context.lineWidth = Math.max(0.035, 0.6 / pixelsPerTile);
    context.strokeStyle = "rgba(220, 226, 209, 0.085)";
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

    context.strokeStyle = "rgba(232, 236, 220, 0.18)";
    context.lineWidth = Math.max(0.06, 1 / pixelsPerTile);
    context.setLineDash([1.2, 1.2]);
    context.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    context.setLineDash([]);

    drawPowerConnections(context, blueprint.entities, pixelsPerTile);
    for (const planned of orderedEntities) {
      drawEntity(
        context,
        planned,
        pixelsPerTile,
        entityRenderData.get(planned.entity.entity_number) ?? {},
      );
    }
    context.restore();

    for (const port of blueprint.inputPorts) drawPort(context, port, worldToScreen(port.position), true);
    drawPort(context, blueprint.outputPort, worldToScreen(blueprint.outputPort.position), false);
  }, [assetRevision, blueprint, bounds, entityRenderData, orderedEntities, pan, pixelsPerTile, viewport]);

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
    <section className={`factorio-preview${expanded ? " is-expanded" : ""}`} aria-labelledby="factorio-preview-heading">
      <div className="factorio-preview__heading">
        <div>
          <small>Factorio view · exact vanilla sprites</small>
          <h3 id="factorio-preview-heading">Blueprint preview</h3>
          <p>{blueprint.entities.length.toLocaleString()} placed entities · {machineCount.toLocaleString()} machines</p>
        </div>
        <div className="factorio-preview__controls" aria-label="Blueprint preview controls">
          <button type="button" onClick={() => adjustZoom(0.8)} aria-label="Zoom blueprint out">−</button>
          <output aria-label="Blueprint zoom">{Math.round(zoom * 100)}%</output>
          <button type="button" onClick={() => adjustZoom(1.25)} aria-label="Zoom blueprint in">+</button>
          <button type="button" className="factorio-preview__fit" onClick={resetView}>Fit</button>
          <button
            type="button"
            className="factorio-preview__expand"
            onClick={() => setExpanded((current) => !current)}
            aria-label={expanded ? "Close expanded blueprint preview" : "Expand blueprint preview"}
          >{expanded ? "Close" : "Expand"}</button>
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
        <span><i className="is-material" />Items on belts</span>
        <span><i className="is-machine" />Vanilla entity sprites</span>
        <small>Drag to pan · scroll to zoom · hover to inspect</small>
      </div>
    </section>
  );
}

import { type CSSProperties, useEffect, useRef } from "react";
import {
  type CelestialStar,
  parseHipparcosCatalog,
  renderMilkyWay,
} from "../lib/skyProjection";

export type OrbitPanel = "projects" | "writing" | "contact";

type OrbitalFieldProps = {
  activePanel: OrbitPanel | null;
  onSelect: (panel: OrbitPanel) => void;
};

type OrbitBody = {
  id: OrbitPanel;
  label: string;
  shortLabel: string;
  body: "Io" | "Europa" | "Ganymede";
  semimajorAxisKm: number;
  eccentricity: number;
  periodDays: number;
  argumentOfPeriapsisDegrees: number;
  meanAnomalyDegrees: number;
  inclinationDegrees: number;
  ascendingNodeDegrees: number;
  color: string;
};

// JPL Planetary Satellite Mean Elements, epoch 2000-01-01.5 TDB.
const orbitItems: OrbitBody[] = [
  {
    id: "projects",
    label: "Projects",
    shortLabel: "P",
    body: "Io",
    semimajorAxisKm: 421_800,
    eccentricity: 0.004,
    periodDays: 1.762732,
    argumentOfPeriapsisDegrees: 49.1,
    meanAnomalyDegrees: 330.9,
    inclinationDegrees: 0,
    ascendingNodeDegrees: 0,
    color: "#d8a24c",
  },
  {
    id: "writing",
    label: "Writing",
    shortLabel: "W",
    body: "Europa",
    semimajorAxisKm: 671_100,
    eccentricity: 0.009,
    periodDays: 3.525463,
    argumentOfPeriapsisDegrees: 45,
    meanAnomalyDegrees: 345.4,
    inclinationDegrees: 0.5,
    ascendingNodeDegrees: 184,
    color: "#ded2bd",
  },
  {
    id: "contact",
    label: "Contact",
    shortLabel: "C",
    body: "Ganymede",
    semimajorAxisKm: 1_070_400,
    eccentricity: 0.001,
    periodDays: 7.155588,
    argumentOfPeriapsisDegrees: 198.3,
    meanAnomalyDegrees: 324.8,
    inclinationDegrees: 0.2,
    ascendingNodeDegrees: 58.5,
    color: "#ad7253",
  },
];

export const orbitBodyByPanel: Record<OrbitPanel, OrbitBody["body"]> = {
  projects: "Io",
  writing: "Europa",
  contact: "Ganymede",
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;
// Begin at a valid, well-separated point in the measured orbital model.
const simulationStartDays = 18.141;
const simulationDaysPerSecond = 0.012;

function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number) {
  const tau = Math.PI * 2;
  const normalizedMeanAnomaly = ((meanAnomaly % tau) + tau) % tau;
  let eccentricAnomaly = normalizedMeanAnomaly;

  for (let step = 0; step < 5; step += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly -
        eccentricity * Math.sin(eccentricAnomaly) -
        normalizedMeanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
  }

  return eccentricAnomaly;
}

export function OrbitalField({ activePanel, onSelect }: OrbitalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodeRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let width = 0;
    let height = 0;
    let frame = 0;
    let skyFrame = 0;
    let renderedSky: HTMLCanvasElement | null = null;
    let catalogStars: CelestialStar[] = [];
    let catalogReady = false;
    let disposed = false;
    const catalogRequest = new AbortController();

    const orbitGeometry = () => {
      const compact = width < 640;
      const outerRadius = compact
        ? Math.max(132, width / 2 - 27)
        : Math.min(690, width / 2 - 58);
      const desktopProgress = Math.min(Math.max((width - 640) / 800, 0), 1);
      const innerFraction = compact ? 0.92 : 0.76 - desktopProgress * 0.14;
      const minimumAxis = orbitItems[0].semimajorAxisKm;
      const maximumAxis = orbitItems[orbitItems.length - 1].semimajorAxisKm;
      const logRange = Math.log(maximumAxis / minimumAxis);
      const projectedOuterRadius = compact
        ? Math.min(outerRadius * 0.9, height * 0.3)
        : Math.min(outerRadius * 0.55, height * 0.36, 315);

      return {
        compact,
        projection: projectedOuterRadius / outerRadius,
        viewRotation: compact ? -0.04 : 0.2,
        radii: orbitItems.map((item) => {
          const logPosition =
            Math.log(item.semimajorAxisKm / minimumAxis) / logRange;
          return outerRadius *
            (innerFraction + (1 - innerFraction) * logPosition);
        }),
      };
    };

    const updateSky = () => {
      if (!width || !height || disposed) return;
      const geometry = orbitGeometry();
      renderedSky = renderMilkyWay(
        {
          width,
          height,
          orbitProjection: geometry.projection,
          orbitRotation: geometry.viewRotation,
          compact: geometry.compact,
        },
        catalogStars,
      );
      if (reduceMotion) draw(0);
    };

    const scheduleSkyUpdate = () => {
      window.cancelAnimationFrame(skyFrame);
      skyFrame = window.requestAnimationFrame(updateSky);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (catalogReady) scheduleSkyUpdate();
      if (reduceMotion) draw(0);
    };

    const orbitPoint = (
      item: OrbitBody,
      eccentricAnomaly: number,
      displayRadius: number,
      geometry: ReturnType<typeof orbitGeometry>,
      centerX = 0,
      centerY = 0,
    ) => {
      const orbitalX = Math.cos(eccentricAnomaly) - item.eccentricity;
      const orbitalY =
        Math.sqrt(1 - item.eccentricity ** 2) * Math.sin(eccentricAnomaly);
      const argument = radians(item.argumentOfPeriapsisDegrees);
      const inclination = radians(item.inclinationDegrees);
      const ascendingNode = radians(item.ascendingNodeDegrees);
      const cosArgument = Math.cos(argument);
      const sinArgument = Math.sin(argument);
      const cosInclination = Math.cos(inclination);
      const sinInclination = Math.sin(inclination);
      const cosNode = Math.cos(ascendingNode);
      const sinNode = Math.sin(ascendingNode);
      const referenceX =
        (cosNode * cosArgument - sinNode * sinArgument * cosInclination) *
          orbitalX +
        (-cosNode * sinArgument - sinNode * cosArgument * cosInclination) *
          orbitalY;
      const referenceY =
        (sinNode * cosArgument + cosNode * sinArgument * cosInclination) *
          orbitalX +
        (-sinNode * sinArgument + cosNode * cosArgument * cosInclination) *
          orbitalY;
      const referenceZ =
        sinArgument * sinInclination * orbitalX +
        cosArgument * sinInclination * orbitalY;
      const viewCos = Math.cos(geometry.viewRotation);
      const viewSin = Math.sin(geometry.viewRotation);
      const viewX = referenceX * viewCos - referenceY * viewSin;
      const viewY = referenceX * viewSin + referenceY * viewCos;

      return {
        x: centerX + viewX * displayRadius,
        y:
          centerY +
          (viewY * geometry.projection - referenceZ * 0.12) * displayRadius,
      };
    };

    function draw(timestamp: number) {
      ctx.clearRect(0, 0, width, height);
      pointer.x += (pointer.targetX - pointer.x) * 0.035;
      pointer.y += (pointer.targetY - pointer.y) * 0.035;

      if (renderedSky) {
        ctx.save();
        ctx.globalAlpha = 0.97;
        ctx.drawImage(renderedSky, 0, 0, width, height);
        ctx.restore();
      }

      const geometry = orbitGeometry();
      const compact = geometry.compact;
      const centerX = width / 2 + pointer.x * 9;
      const centerY = height * (compact ? 0.46 : 0.5) + pointer.y * 7;
      const exclusionX = compact
        ? Math.min(width * 0.38, 150)
        : Math.min(width * 0.3, 330);
      const exclusionY = compact ? 58 : 78;

      ctx.save();
      ctx.translate(centerX, centerY);
      orbitItems.forEach((item, index) => {
        ctx.beginPath();
        let drawing = false;
        const segments = 260;

        for (let segment = 0; segment <= segments; segment += 1) {
          const eccentricAnomaly = (segment / segments) * Math.PI * 2;
          const point = orbitPoint(
            item,
            eccentricAnomaly,
            geometry.radii[index],
            geometry,
          );
          const insideNameGap =
            Math.pow(point.x / exclusionX, 4) +
              Math.pow(point.y / exclusionY, 4) <
            1;

          if (insideNameGap) {
            drawing = false;
          } else if (drawing) {
            ctx.lineTo(point.x, point.y);
          } else {
            ctx.moveTo(point.x, point.y);
            drawing = true;
          }
        }

        ctx.strokeStyle = "rgba(231, 219, 196, 0.16)";
        ctx.lineWidth = 0.75;
        ctx.stroke();
      });

      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 82);
      core.addColorStop(0, "rgba(255, 238, 202, 0.15)");
      core.addColorStop(0.18, "rgba(224, 111, 70, 0.06)");
      core.addColorStop(1, "rgba(6, 6, 8, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, 82, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const simulatedDays =
        simulationStartDays +
        (reduceMotion ? 0 : (timestamp / 1000) * simulationDaysPerSecond);

      orbitItems.forEach((item, index) => {
        const node = nodeRefs.current[index];
        if (!node) return;
        const meanAnomaly =
          radians(item.meanAnomalyDegrees) +
          (simulatedDays / item.periodDays) * Math.PI * 2;
        const eccentricAnomaly = solveEccentricAnomaly(
          meanAnomaly,
          item.eccentricity,
        );
        const point = orbitPoint(
          item,
          eccentricAnomaly,
          geometry.radii[index],
          geometry,
          centerX,
          centerY,
        );
        const nodeGapX = compact
          ? Math.min(width * 0.33, 128) + 24
          : Math.min(width * 0.24, 290) + 54;
        const nodeGapY = compact ? 74 : 78;
        const hiddenBehindName =
          Math.pow((point.x - centerX) / nodeGapX, 4) +
            Math.pow((point.y - centerY) / nodeGapY, 4) <
          1;

        node.style.left = `${point.x}px`;
        node.style.top = `${point.y}px`;
        node.style.zIndex = "3";
        node.style.opacity = hiddenBehindName ? "0" : "1";
        node.style.pointerEvents = hiddenBehindName ? "none" : "auto";
        node.tabIndex = hiddenBehindName ? -1 : 0;
      });

      if (!reduceMotion) frame = window.requestAnimationFrame(draw);
    }

    const resetPointer = () => {
      pointer.targetX = 0;
      pointer.targetY = 0;
    };

    const handlePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        resetPointer();
        return;
      }
      pointer.targetX = (event.clientX - rect.left) / rect.width - 0.5;
      pointer.targetY = (event.clientY - rect.top) / rect.height - 0.5;
    };

    resize();
    fetch("/hipparcos-bright-stars.tsv", {
      signal: catalogRequest.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the star catalog");
        return response.text();
      })
      .then((source) => {
        if (disposed) return;
        catalogStars = parseHipparcosCatalog(source);
        catalogReady = true;
        scheduleSkyUpdate();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("The Hipparcos star layer could not be loaded.", error);
        catalogReady = true;
        scheduleSkyUpdate();
      });
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointer);
    window.addEventListener("blur", resetPointer);
    if (!reduceMotion) frame = window.requestAnimationFrame(draw);

    return () => {
      disposed = true;
      catalogRequest.abort();
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(skyFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("blur", resetPointer);
    };
  }, []);

  return (
    <div className="orbital-stage">
      <canvas ref={canvasRef} className="orbital-field" aria-hidden="true" />
      {orbitItems.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => {
            nodeRefs.current[index] = node;
          }}
          className={`orbit-node${activePanel === item.id ? " is-active" : ""}`}
          type="button"
          onClick={() => onSelect(item.id)}
          aria-pressed={activePanel === item.id}
          aria-label={`${item.label} — ${item.body}`}
          title={`${item.body} · ${item.label}`}
          style={{ "--moon-color": item.color } as CSSProperties}
        >
          <span className="orbit-node__dot" aria-hidden="true" />
          <span className="orbit-node__label" aria-hidden="true">
            {item.label}
          </span>
          <span className="orbit-node__short" aria-hidden="true">
            {item.shortLabel}
          </span>
        </button>
      ))}
    </div>
  );
}

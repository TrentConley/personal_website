import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  type CelestialStar,
  type RenderedSky,
  parseGaiaFaintCatalog,
  parseHipparcosCatalog,
  projectCelestialCoordinate,
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

type StarDiscovery = {
  id: string;
  name: string;
  rightAscensionDegrees: number;
  declinationDegrees: number;
  distance: string;
  kind: string;
  detail: string;
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

// A deliberately small set of real systems within this projected field.
// Planet counts and parameters follow the NASA Exoplanet Archive (July 2026).
const starDiscoveries: StarDiscovery[] = [
  {
    id: "alpha-centauri",
    name: "Alpha Centauri",
    rightAscensionDegrees: 219.9021,
    declinationDegrees: -60.834,
    distance: "4.25 light-years",
    kind: "Triple-star system",
    detail:
      "Proxima b orbits in the habitable zone. Its actual habitability is unknown.",
    color: "#f3d6a0",
  },
  {
    id: "gj-667-c",
    name: "GJ 667 C",
    rightAscensionDegrees: 259.7510609,
    declinationDegrees: -34.9977651,
    distance: "23.6 light-years",
    kind: "Red dwarf · 5 reported planets",
    detail:
      "Planet c receives 0.88× Earth's light: potentially temperate, not known habitable.",
    color: "#dc8a61",
  },
  {
    id: "wolf-1061",
    name: "Wolf 1061",
    rightAscensionDegrees: 247.5748276,
    declinationDegrees: -12.6676866,
    distance: "14.0 light-years",
    kind: "Red dwarf · 3 confirmed planets",
    detail:
      "Planet c receives 1.3× Earth's light and sits near the warm edge of habitability.",
    color: "#e28b63",
  },
  {
    id: "antares",
    name: "Antares",
    rightAscensionDegrees: 247.3519,
    declinationDegrees: -26.432,
    distance: "~550 light-years",
    kind: "Red supergiant",
    detail: "No confirmed planets. It is nearing the end of its stellar life.",
    color: "#ff8a5f",
  },
  {
    id: "sagittarius-a",
    name: "Sagittarius A*",
    rightAscensionDegrees: 266.4168,
    declinationDegrees: -29.0078,
    distance: "~26,000 light-years",
    kind: "The Milky Way's central black hole",
    detail: "About 4 million Suns by mass. Not actually a star.",
    color: "#f0c27b",
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
  const discoveryRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeDiscovery, setActiveDiscovery] = useState<string | null>(null);

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
    let pixelRatio = 1;
    let frame = 0;
    let skyFrame = 0;
    let renderedSky: RenderedSky | null = null;
    let catalogStars: CelestialStar[] = [];
    let catalogReady = false;
    let skyImageReady = false;
    let disposed = false;
    const catalogRequest = new AbortController();
    const skyImage = new Image();

    const orbitGeometry = () => {
      const compact = width < 640;
      const outerRadius = compact
        ? Math.max(98, width / 2 - 50)
        : Math.min(690, width / 2 - 58);
      const desktopProgress = Math.min(Math.max((width - 640) / 800, 0), 1);
      const innerFraction = compact ? 0.72 : 0.76 - desktopProgress * 0.14;
      const minimumAxis = orbitItems[0].semimajorAxisKm;
      const maximumAxis = orbitItems[orbitItems.length - 1].semimajorAxisKm;
      const logRange = Math.log(maximumAxis / minimumAxis);
      const projectedOuterRadius = compact
        ? Math.min(outerRadius * 0.86, height * 0.25)
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
      if (!width || !height || !skyImageReady || !catalogReady || disposed) {
        return;
      }
      const geometry = orbitGeometry();
      renderedSky = renderMilkyWay(
        skyImage,
        {
          width,
          height,
          pixelRatio,
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
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      width = rect.width;
      height = rect.height;
      pixelRatio = dpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (catalogReady && skyImageReady) scheduleSkyUpdate();
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

      const baseGeometry = orbitGeometry();
      const geometry = reduceMotion
        ? baseGeometry
        : {
            ...baseGeometry,
            projection: baseGeometry.projection * (1 + pointer.y * 0.1),
            viewRotation: baseGeometry.viewRotation + pointer.x * 0.035,
          };
      const compact = geometry.compact;

      if (renderedSky) {
        ctx.save();
        ctx.globalAlpha = 1;
        const drawSkyLayer = (
          layer: HTMLCanvasElement,
          scale: number,
          horizontalDepth: number,
          verticalDepth: number,
        ) => {
          const drawWidth = width * scale;
          const drawHeight = height * scale;
          const drawX =
            (width - drawWidth) / 2 - pointer.x * horizontalDepth;
          const drawY =
            (height - drawHeight) / 2 - pointer.y * verticalDepth;
          ctx.drawImage(layer, drawX, drawY, drawWidth, drawHeight);
        };

        const skyScale = compact ? 1.035 : 1.025;
        drawSkyLayer(
          renderedSky.diffuse,
          skyScale,
          compact ? 7 : 15,
          compact ? 6 : 11,
        );
        drawSkyLayer(
          renderedSky.stars,
          skyScale,
          compact ? 11 : 27,
          compact ? 9 : 19,
        );
        ctx.restore();
      }

      const centerX = width / 2 + pointer.x * 14;
      const centerY = height * (compact ? 0.62 : 0.5) + pointer.y * 11;
      const exclusionX = compact
        ? Math.min(width * 0.38, 150)
        : Math.min(width * 0.3, 330);
      const exclusionY = compact ? 64 : 78;

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
        (reduceMotion || compact
          ? 0
          : (timestamp / 1000) * simulationDaysPerSecond);

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
        let point = orbitPoint(
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
        let hiddenBehindName =
          Math.pow((point.x - centerX) / nodeGapX, 4) +
            Math.pow((point.y - centerY) / nodeGapY, 4) <
          1;

        if (compact && hiddenBehindName) {
          const offsetX = point.x - centerX;
          const offsetY = point.y - centerY;
          let separation = 1;

          for (let step = 0; step < 10; step += 1) {
            const projectedX = offsetX * separation;
            const projectedY = offsetY * separation;
            const gapPosition =
              Math.pow(projectedX / nodeGapX, 4) +
              Math.pow(projectedY / nodeGapY, 4);
            if (gapPosition >= 1.18) break;
            separation *= 1.09;
          }

          point = {
            x: Math.min(
              Math.max(centerX + offsetX * separation, 42),
              width - 42,
            ),
            y: Math.min(
              Math.max(centerY + offsetY * separation, 92),
              height - 32,
            ),
          };
          hiddenBehindName = false;
        }

        node.style.left = `${point.x}px`;
        node.style.top = `${point.y}px`;
        node.style.zIndex = "3";
        node.style.opacity = hiddenBehindName ? "0" : "1";
        node.style.pointerEvents = hiddenBehindName ? "none" : "auto";
        node.tabIndex = hiddenBehindName ? -1 : 0;
      });

      const skyScale = compact ? 1.035 : 1.025;
      const skyWidth = width * skyScale;
      const skyHeight = height * skyScale;
      const skyLeft =
        (width - skyWidth) / 2 - pointer.x * (compact ? 11 : 27);
      const skyTop =
        (height - skyHeight) / 2 - pointer.y * (compact ? 9 : 19);

      starDiscoveries.forEach((discovery, index) => {
        const node = discoveryRefs.current[index];
        if (!node) return;
        const projection = projectCelestialCoordinate(
          discovery.rightAscensionDegrees,
          discovery.declinationDegrees,
          {
            width,
            height,
            orbitProjection: baseGeometry.projection,
            orbitRotation: baseGeometry.viewRotation,
            compact,
          },
        );
        const pointX = projection ? skyLeft + projection.x * skyWidth : -100;
        const pointY = projection ? skyTop + projection.y * skyHeight : -100;
        const clearOfEdges =
          pointX > (compact ? 18 : 28) &&
          pointX < width - (compact ? 18 : 28) &&
          pointY > (compact ? 76 : 92) &&
          pointY < height - (compact ? 20 : 32);
        const visible = Boolean(projection?.visible && clearOfEdges);
        const compactCardWidth = Math.min(248, width - 32);
        const centeredCardLeft = pointX - compactCardWidth / 2;
        const centeredCardRight = pointX + compactCardWidth / 2;
        const cardShift =
          centeredCardLeft < 16
            ? 16 - centeredCardLeft
            : centeredCardRight > width - 16
              ? width - 16 - centeredCardRight
              : 0;

        node.style.left = `${pointX}px`;
        node.style.top = `${pointY}px`;
        node.style.setProperty("--discovery-card-shift", `${cardShift}px`);
        node.style.visibility = visible ? "visible" : "hidden";
        node.tabIndex = visible ? 0 : -1;
        node.classList.toggle("is-left-half", pointX < width / 2);
        node.classList.toggle("is-near-top", pointY < height * 0.34);
        node.classList.toggle("is-near-bottom", pointY > height * 0.72);
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

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") resetPointer();
    };

    const handleSkyLoad = () => {
      if (disposed) return;
      skyImageReady = true;
      if (catalogReady) scheduleSkyUpdate();
    };

    const handleSkyError = () => {
      console.warn("The Gaia sky map could not be loaded.");
    };

    resize();
    skyImage.decoding = "async";
    skyImage.addEventListener("load", handleSkyLoad);
    skyImage.addEventListener("error", handleSkyError);
    skyImage.src = "/gaia-edr3-sky.webp";
    if (skyImage.complete && skyImage.naturalWidth) handleSkyLoad();
    const hipparcosCatalog = fetch("/hipparcos-bright-stars.tsv", {
      signal: catalogRequest.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the Hipparcos catalog");
        return response.text();
      })
      .then(parseHipparcosCatalog)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("The Hipparcos star layer could not be loaded.", error);
        }
        return [];
      });
    const gaiaCatalog = fetch("/gaia-faint-stars.bin", {
      signal: catalogRequest.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the Gaia catalog");
        return response.arrayBuffer();
      })
      .then(parseGaiaFaintCatalog)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("The Gaia point-star layer could not be loaded.", error);
        }
        return [];
      });

    Promise.all([hipparcosCatalog, gaiaCatalog]).then(
      ([hipparcosStars, gaiaStars]) => {
        if (disposed) return;
        catalogStars = [...hipparcosStars, ...gaiaStars];
        catalogReady = true;
        if (skyImageReady) scheduleSkyUpdate();
      },
    );
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointer);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("blur", resetPointer);
    if (!reduceMotion) frame = window.requestAnimationFrame(draw);

    return () => {
      disposed = true;
      catalogRequest.abort();
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(skyFrame);
      skyImage.removeEventListener("load", handleSkyLoad);
      skyImage.removeEventListener("error", handleSkyError);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
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
      {starDiscoveries.map((discovery, index) => (
        <button
          key={discovery.id}
          ref={(node) => {
            discoveryRefs.current[index] = node;
          }}
          className={`star-discovery${
            activeDiscovery === discovery.id ? " is-revealed" : ""
          }${activePanel ? " is-suppressed" : ""}`}
          type="button"
          onClick={() =>
            setActiveDiscovery((current) =>
              current === discovery.id ? null : discovery.id,
            )
          }
          onBlur={() => setActiveDiscovery(null)}
          aria-label={`${discovery.name}. ${discovery.distance}. ${discovery.kind}. ${discovery.detail}`}
          style={{ "--star-color": discovery.color } as CSSProperties}
        >
          <span className="star-discovery__dot" aria-hidden="true" />
          <span className="star-discovery__card" aria-hidden="true">
            <span className="star-discovery__heading">
              <strong>{discovery.name}</strong>
              <span>{discovery.distance}</span>
            </span>
            <span className="star-discovery__kind">{discovery.kind}</span>
            <span className="star-discovery__detail">{discovery.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

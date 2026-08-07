import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  type EclipticPoint,
  getMarsEphemeris,
  getOrbitTracks,
} from "../lib/marsEphemeris";
import { optimizeMarsTransfer } from "../lib/orbitalTransfer";

type ProjectedPoint = { x: number; y: number };

const pathFromPoints = (points: ProjectedPoint[]) =>
  points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(5)} ${point.y.toFixed(5)}`,
    )
    .join(" ");

function project(point: EclipticPoint, compact: boolean): ProjectedPoint {
  const rotation = compact ? -0.52 : -0.38;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const rotatedX = point.x * cosine - point.y * sine;
  const rotatedY = point.x * sine + point.y * cosine;
  const tilt = compact ? 0.68 : 0.43;

  return {
    x: rotatedX + (compact ? 0 : 0.18),
    y: -(rotatedY * tilt + point.z * 0.92) + (compact ? 0.04 : 0.08),
  };
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const arrivalFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function MarsTrackerPage() {
  const [now, setNow] = useState(() => new Date());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [compact, setCompact] = useState(() =>
    window.matchMedia("(max-width: 640px)").matches,
  );
  const tracks = useMemo(() => getOrbitTracks(now), []);
  const transfer = useMemo(() => optimizeMarsTransfer(now), []);
  const ephemeris = getMarsEphemeris(now);
  const distanceMillions = ephemeris.distanceKm / 1_000_000;
  const earth = project(ephemeris.earth, compact);
  const mars = project(ephemeris.mars, compact);
  const arrivalMars = project(transfer.arrivalMars, compact);
  const earthOrbit = tracks.earth.map((point) => project(point, compact));
  const marsOrbit = tracks.mars.map((point) => project(point, compact));
  const transferPath = transfer.path.map((point) => project(point, compact));
  const arcsecondRange = Math.min(
    1,
    Math.max(
      0,
      (ephemeris.apparentDiameterArcseconds - 3.5) / (25.1 - 3.5),
    ),
  );
  const arcsecondRateMicro =
    ephemeris.apparentDiameterRateArcsecondsPerSecond * 1_000_000;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Mars, now — Trent Conley";
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    const media = window.matchMedia("(max-width: 640px)");
    const handleMedia = () => setCompact(media.matches);
    media.addEventListener("change", handleMedia);

    return () => {
      document.title = previousTitle;
      window.clearInterval(timer);
      media.removeEventListener("change", handleMedia);
    };
  }, []);

  return (
    <main className={`mars-tracker${detailsOpen ? " is-details-open" : ""}`}>
      <a className="mars-tracker__mark" href="/" aria-label="Back to home">
        TC
      </a>

      <button
        className="mars-tracker__details-toggle"
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
        aria-controls="mars-details"
      >
        <span>{detailsOpen ? "Close" : "Details"}</span>
        <i aria-hidden="true">{detailsOpen ? "−" : "+"}</i>
      </button>

      <header className="mars-tracker__readout">
        <span>EARTH → MARS</span>
        <div aria-label={`${distanceMillions.toFixed(3)} million kilometers`}>
          <strong>{distanceMillions.toFixed(3)}</strong>
          <small>M KM</small>
        </div>
      </header>

      <figure className="mars-orbit-figure">
        <svg
          className="mars-orbit-map"
          viewBox={compact ? "-2 -1.45 4 2.9" : "-2.12 -1.12 4.24 2.24"}
          role="img"
          aria-labelledby="mars-orbit-title mars-orbit-description"
        >
          <title id="mars-orbit-title">Earth, Mars, and an optimized transfer</title>
          <desc id="mars-orbit-description">
            An oblique heliocentric view. Earth and Mars are {distanceMillions.toFixed(3)}
            million kilometers apart. A Lambert transfer departing now curves from
            Earth to Mars at its calculated future arrival position.
          </desc>
          <defs>
            <radialGradient id="mars-sun" cx="42%" cy="38%">
              <stop offset="0" stopColor="#fff8dc" />
              <stop offset="0.4" stopColor="#e8bb65" />
              <stop offset="1" stopColor="#a74e2d" />
            </radialGradient>
            <radialGradient id="mars-planet" cx="32%" cy="28%">
              <stop offset="0" stopColor="#ffd0a7" />
              <stop offset="0.3" stopColor="#c7673e" />
              <stop offset="0.76" stopColor="#71301d" />
              <stop offset="1" stopColor="#2d1510" />
            </radialGradient>
            <radialGradient id="earth-planet" cx="30%" cy="27%">
              <stop offset="0" stopColor="#f1eee0" />
              <stop offset="0.34" stopColor="#a7b9ad" />
              <stop offset="0.74" stopColor="#536761" />
              <stop offset="1" stopColor="#182220" />
            </radialGradient>
            <linearGradient
              id="transfer-gradient"
              gradientUnits="userSpaceOnUse"
              x1={earth.x}
              y1={earth.y}
              x2={arrivalMars.x}
              y2={arrivalMars.y}
            >
              <stop offset="0" stopColor="#b8c9bd" />
              <stop offset="0.42" stopColor="#e0b071" />
              <stop offset="1" stopColor="#d16b43" />
            </linearGradient>
            <filter id="sun-glow" x="-400%" y="-400%" width="900%" height="900%">
              <feGaussianBlur stdDeviation="0.035" />
            </filter>
            <filter id="planet-glow" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="0.018" />
            </filter>
            <filter id="transfer-glow" x="-30%" y="-80%" width="160%" height="260%">
              <feGaussianBlur stdDeviation="0.012" />
            </filter>
          </defs>

          <path className="mars-orbit-map__orbit mars-orbit-map__orbit--mars" d={pathFromPoints(marsOrbit)} />
          <path className="mars-orbit-map__orbit mars-orbit-map__orbit--earth" d={pathFromPoints(earthOrbit)} />

          <path
            className="mars-orbit-map__transfer-glow"
            d={pathFromPoints(transferPath)}
            filter="url(#transfer-glow)"
          />
          <path
            id="earth-mars-transfer"
            className="mars-orbit-map__transfer"
            d={pathFromPoints(transferPath)}
          />
          <path
            className="mars-orbit-map__transfer-pulse"
            d={pathFromPoints(transferPath)}
          />

          <g transform={`translate(${project({ x: 0, y: 0, z: 0 }, compact).x} ${project({ x: 0, y: 0, z: 0 }, compact).y})`}>
            <circle className="mars-orbit-map__sun-glow" r="0.095" filter="url(#sun-glow)" />
            <circle className="mars-orbit-map__sun" r="0.027" fill="url(#mars-sun)" />
          </g>

          <g transform={`translate(${earth.x} ${earth.y})`}>
            <circle className="mars-orbit-map__earth-glow" r="0.055" filter="url(#planet-glow)" />
            <circle className="mars-orbit-map__earth" r="0.024" fill="url(#earth-planet)" />
            <circle className="mars-orbit-map__locator" r="0.052" />
            <text className="mars-orbit-map__label" x="0.065" y="-0.05">EARTH</text>
          </g>

          <g transform={`translate(${mars.x} ${mars.y})`}>
            <circle className="mars-orbit-map__mars-glow" r="0.07" filter="url(#planet-glow)" />
            <circle className="mars-orbit-map__mars" r="0.029" fill="url(#mars-planet)" />
            <circle className="mars-orbit-map__locator mars-orbit-map__locator--mars" r="0.061" />
            <text className="mars-orbit-map__label mars-orbit-map__label--mars" x="0.075" y="-0.06">MARS · NOW</text>
          </g>

          <g className="mars-orbit-map__arrival" transform={`translate(${arrivalMars.x} ${arrivalMars.y})`}>
            <circle r="0.052" />
            <circle r="0.012" />
            <text className="mars-orbit-map__label mars-orbit-map__label--arrival" x="0.068" y="0.016">ARRIVAL</text>
          </g>
        </svg>
        <figcaption className="sr-only">
          Planet positions and orbit paths are to scale. Markers are enlarged.
          The transfer is a two-body Lambert solution with departure fixed now.
        </figcaption>
      </figure>

      <div className="mars-tracker__arcsecond-teaser" aria-hidden="true">
        <strong>{ephemeris.apparentDiameterArcseconds.toFixed(4)}″</strong>
        <span>FROM EARTH</span>
      </div>

      <div className="mars-tracker__clock" aria-label="Live UTC time">
        <i aria-hidden="true" />
        <time dateTime={now.toISOString()}>{dateFormatter.format(now)} UTC</time>
      </div>

      <aside
        id="mars-details"
        className="mars-details"
        aria-hidden={!detailsOpen}
      >
        <section className="mars-details__apparent">
          <span>MARS IN OUR SKY</span>
          <output aria-live="polite">
            {ephemeris.apparentDiameterArcseconds.toFixed(7)}″
          </output>
          <small>
            {arcsecondRateMicro >= 0 ? "+" : ""}
            {arcsecondRateMicro.toFixed(3)} µas / s
          </small>
          <div className="mars-details__arc-scale">
            <div>
              <i
                style={
                  { "--arc-position": `${arcsecondRange * 100}%` } as CSSProperties
                }
              />
            </div>
            <span>3.5″</span>
            <span>25.1″</span>
          </div>
        </section>

        <dl className="mars-details__grid">
          <div>
            <dt>RANGE</dt>
            <dd>{(ephemeris.apparentDistanceKm / 1_000_000).toFixed(6)} M KM</dd>
          </div>
          <div>
            <dt>ELONGATION</dt>
            <dd>{ephemeris.solarElongationDegrees.toFixed(3)}°</dd>
          </div>
          <div>
            <dt>RA</dt>
            <dd>{ephemeris.rightAscensionHours.toFixed(5)} H</dd>
          </div>
          <div>
            <dt>DEC</dt>
            <dd>{ephemeris.declinationDegrees.toFixed(4)}°</dd>
          </div>
        </dl>

        <section className="mars-details__transfer">
          <div>
            <span>TRANSFER · DEPART NOW</span>
            <strong>{arrivalFormatter.format(transfer.arrivalDate)}</strong>
          </div>
          <dl>
            <div>
              <dt>FLIGHT</dt>
              <dd>{transfer.timeOfFlightDays.toFixed(1)} D</dd>
            </div>
            <div>
              <dt>Σ V∞</dt>
              <dd>{transfer.totalVInfinityKmPerSecond.toFixed(2)} KM/S</dd>
            </div>
            <div>
              <dt>C3</dt>
              <dd>{transfer.c3Km2PerSecond2.toFixed(1)} KM²/S²</dd>
            </div>
          </dl>
          <p>
            Arrival time minimizes departure + arrival V∞. Sun-only,
            zero-revolution Lambert solution.
          </p>
        </section>
      </aside>

      <a
        className="mars-tracker__method"
        href="https://trajbrowser.arc.nasa.gov/user_guide.php"
        target="_blank"
        rel="noreferrer"
      >
        VSOP87 · LAMBERT
      </a>
    </main>
  );
}

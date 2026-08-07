import { useEffect, useMemo, useState } from "react";
import {
  type EclipticPoint,
  getMarsEphemeris,
  getOrbitTracks,
} from "../lib/marsEphemeris";

const pathFromPoints = (points: EclipticPoint[]) =>
  points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(5)} ${(-point.y).toFixed(5)}`,
    )
    .join(" ");

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

export function MarsTrackerPage() {
  const [now, setNow] = useState(() => new Date());
  const tracks = useMemo(() => getOrbitTracks(now), []);
  const ephemeris = getMarsEphemeris(now);
  const distanceMillions = ephemeris.distanceKm / 1_000_000;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Mars, now — Trent Conley";
    const timer = window.setInterval(() => setNow(new Date()), 1_000);

    return () => {
      document.title = previousTitle;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main className="mars-tracker">
      <a className="mars-tracker__mark" href="/" aria-label="Back to home">
        TC
      </a>

      <div className="mars-tracker__clock" aria-label="Live UTC time">
        <i aria-hidden="true" />
        <time dateTime={now.toISOString()}>{dateFormatter.format(now)} UTC</time>
      </div>

      <header className="mars-tracker__readout">
        <div aria-label={`${distanceMillions.toFixed(3)} million kilometers`}>
          <strong>{distanceMillions.toFixed(3)}</strong>
          <span>M KM</span>
        </div>
      </header>

      <figure className="mars-orbit-figure">
        <svg
          className="mars-orbit-map"
          viewBox="-1.86 -1.86 3.72 3.72"
          role="img"
          aria-labelledby="mars-orbit-title mars-orbit-description"
        >
          <title id="mars-orbit-title">Earth and Mars right now</title>
          <desc id="mars-orbit-description">
            A live, north-ecliptic view of the planets around the Sun. Earth and
            Mars are {distanceMillions.toFixed(3)} million kilometers apart.
          </desc>
          <defs>
            <radialGradient id="mars-sun" cx="42%" cy="38%">
              <stop offset="0" stopColor="#fff7d6" />
              <stop offset="0.38" stopColor="#f0c36a" />
              <stop offset="1" stopColor="#b86131" />
            </radialGradient>
            <radialGradient id="mars-planet" cx="32%" cy="28%">
              <stop offset="0" stopColor="#ffd0a7" />
              <stop offset="0.28" stopColor="#c7673e" />
              <stop offset="0.75" stopColor="#79351f" />
              <stop offset="1" stopColor="#311712" />
            </radialGradient>
            <radialGradient id="earth-planet" cx="30%" cy="27%">
              <stop offset="0" stopColor="#f1eee0" />
              <stop offset="0.32" stopColor="#a7b9ad" />
              <stop offset="0.72" stopColor="#576b65" />
              <stop offset="1" stopColor="#1b2625" />
            </radialGradient>
            <filter id="sun-glow" x="-400%" y="-400%" width="900%" height="900%">
              <feGaussianBlur stdDeviation="0.035" />
            </filter>
            <filter id="planet-glow" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="0.018" />
            </filter>
          </defs>

          <g className="mars-orbit-map__plane">
            <circle className="mars-orbit-map__compass" r="1.74" />
            <path className="mars-orbit-map__orbit mars-orbit-map__orbit--mars" d={pathFromPoints(tracks.mars)} />
            <path className="mars-orbit-map__orbit mars-orbit-map__orbit--earth" d={pathFromPoints(tracks.earth)} />

            <line
              className="mars-orbit-map__distance"
              x1={ephemeris.earth.x}
              y1={-ephemeris.earth.y}
              x2={ephemeris.mars.x}
              y2={-ephemeris.mars.y}
            />

            <circle className="mars-orbit-map__sun-glow" r="0.095" filter="url(#sun-glow)" />
            <circle className="mars-orbit-map__sun" r="0.027" fill="url(#mars-sun)" />

            <g transform={`translate(${ephemeris.earth.x} ${-ephemeris.earth.y})`}>
              <circle className="mars-orbit-map__earth-glow" r="0.055" filter="url(#planet-glow)" />
              <circle className="mars-orbit-map__earth" r="0.024" fill="url(#earth-planet)" />
              <circle className="mars-orbit-map__locator" r="0.052" />
              <text className="mars-orbit-map__label" x="0.07" y="-0.055">EARTH</text>
            </g>

            <g transform={`translate(${ephemeris.mars.x} ${-ephemeris.mars.y})`}>
              <circle className="mars-orbit-map__mars-glow" r="0.07" filter="url(#planet-glow)" />
              <circle className="mars-orbit-map__mars" r="0.029" fill="url(#mars-planet)" />
              <circle className="mars-orbit-map__locator mars-orbit-map__locator--mars" r="0.061" />
              <text className="mars-orbit-map__label mars-orbit-map__label--mars" x="0.078" y="-0.062">MARS</text>
            </g>
          </g>
        </svg>
        <figcaption className="sr-only">
          Positions use live heliocentric ecliptic vectors. Planet markers are
          enlarged for visibility; orbital positions and paths are to scale.
        </figcaption>
      </figure>

      <section className="mars-tracker__metrics" aria-label="Mars measurements">
        <div>
          <strong>{ephemeris.apparentDiameterArcseconds.toFixed(2)}″</strong>
          <span>APPARENT</span>
        </div>
        <div>
          <strong>{ephemeris.distanceAu.toFixed(4)}</strong>
          <span>AU</span>
        </div>
        <div>
          <strong>{ephemeris.lightMinutes.toFixed(1)}</strong>
          <span>LIGHT MIN</span>
        </div>
      </section>

      <a
        className="mars-tracker__method"
        href="https://github.com/cosinekitty/astronomy"
        target="_blank"
        rel="noreferrer"
        title={`VSOP87 ephemeris · solar elongation ${ephemeris.solarElongationDegrees.toFixed(2)}° · RA ${ephemeris.rightAscensionHours.toFixed(4)}h · Dec ${ephemeris.declinationDegrees.toFixed(3)}°`}
      >
        VSOP87
      </a>
    </main>
  );
}

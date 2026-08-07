import {
  AngleFromSun,
  Body,
  EquatorFromVector,
  GeoVector,
  HelioVector,
  RotateVector,
  Rotation_EQJ_ECL,
} from "astronomy-engine";

export type EclipticPoint = {
  x: number;
  y: number;
  z: number;
};

export type MarsEphemeris = {
  time: Date;
  earth: EclipticPoint;
  mars: EclipticPoint;
  distanceAu: number;
  distanceKm: number;
  lightMinutes: number;
  apparentDiameterArcseconds: number;
  apparentDiameterRateArcsecondsPerSecond: number;
  apparentDistanceKm: number;
  solarElongationDegrees: number;
  rightAscensionHours: number;
  declinationDegrees: number;
};

export type OrbitTrack = {
  earth: EclipticPoint[];
  mars: EclipticPoint[];
};

// IAU 2012 exact definition of the astronomical unit.
export const ASTRONOMICAL_UNIT_KM = 149_597_870.7;
// JPL Planetary Physical Parameters: longest equatorial radius.
export const MARS_EQUATORIAL_RADIUS_KM = 3_396.19;
const LIGHT_SPEED_KM_PER_SECOND = 299_792.458;
const EQUATOR_TO_ECLIPTIC = Rotation_EQJ_ECL();

function eclipticPoint(body: Body, time: Date): EclipticPoint {
  const point = RotateVector(EQUATOR_TO_ECLIPTIC, HelioVector(body, time));
  return { x: point.x, y: point.y, z: point.z };
}

function apparentDiameter(time: Date) {
  const apparentVector = GeoVector(Body.Mars, time, true);
  const apparentDistanceKm = apparentVector.Length() * ASTRONOMICAL_UNIT_KM;
  const apparentRadiusRadians = Math.asin(
    MARS_EQUATORIAL_RADIUS_KM / apparentDistanceKm,
  );

  return {
    apparentVector,
    apparentDistanceKm,
    apparentDiameterArcseconds:
      apparentRadiusRadians * 2 * (180 / Math.PI) * 3_600,
  };
}

export function getMarsEphemeris(time = new Date()): MarsEphemeris {
  const earth = eclipticPoint(Body.Earth, time);
  const mars = eclipticPoint(Body.Mars, time);
  const dx = mars.x - earth.x;
  const dy = mars.y - earth.y;
  const dz = mars.z - earth.z;
  const distanceAu = Math.hypot(dx, dy, dz);
  const distanceKm = distanceAu * ASTRONOMICAL_UNIT_KM;

  // GeoVector includes light-travel correction. Its distance is therefore the
  // one that determines the disc Mars presents to an observer on Earth now.
  const apparent = apparentDiameter(time);
  const oneMinuteBefore = apparentDiameter(
    new Date(time.getTime() - 60_000),
  );
  const oneMinuteAfter = apparentDiameter(new Date(time.getTime() + 60_000));
  const equatorial = EquatorFromVector(apparent.apparentVector);

  return {
    time,
    earth,
    mars,
    distanceAu,
    distanceKm,
    lightMinutes: distanceKm / LIGHT_SPEED_KM_PER_SECOND / 60,
    apparentDiameterArcseconds: apparent.apparentDiameterArcseconds,
    apparentDiameterRateArcsecondsPerSecond:
      (oneMinuteAfter.apparentDiameterArcseconds -
        oneMinuteBefore.apparentDiameterArcseconds) /
      120,
    apparentDistanceKm: apparent.apparentDistanceKm,
    solarElongationDegrees: AngleFromSun(Body.Mars, time),
    rightAscensionHours: equatorial.ra,
    declinationDegrees: equatorial.dec,
  };
}

function sampleOrbit(body: Body, center: Date, periodDays: number) {
  const samples = 360;
  const start = center.getTime() - (periodDays * 86_400_000) / 2;

  return Array.from({ length: samples + 1 }, (_, index) =>
    eclipticPoint(
      body,
      new Date(start + (index / samples) * periodDays * 86_400_000),
    ),
  );
}

export function getOrbitTracks(center = new Date()): OrbitTrack {
  return {
    earth: sampleOrbit(Body.Earth, center, 365.256_363_004),
    mars: sampleOrbit(Body.Mars, center, 686.98),
  };
}

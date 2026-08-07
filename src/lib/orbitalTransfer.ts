import {
  Body,
  HelioState,
  RotateState,
  Rotation_EQJ_ECL,
} from "astronomy-engine";
import { ASTRONOMICAL_UNIT_KM, type EclipticPoint } from "./marsEphemeris";

type Vector3 = [number, number, number];

type LambertSolution = {
  departureVelocity: Vector3;
  arrivalVelocity: Vector3;
};

export type MarsTransfer = {
  departureDate: Date;
  arrivalDate: Date;
  timeOfFlightDays: number;
  path: EclipticPoint[];
  arrivalMars: EclipticPoint;
  departureVInfinityKmPerSecond: number;
  arrivalVInfinityKmPerSecond: number;
  totalVInfinityKmPerSecond: number;
  c3Km2PerSecond2: number;
  arrivalErrorKm: number;
};

const SOLAR_MU_AU3_PER_DAY2 = 0.000_295_912_208_285_591_1;
const DAY_SECONDS = 86_400;
const EQUATOR_TO_ECLIPTIC = Rotation_EQJ_ECL();

const add = (a: Vector3, b: Vector3): Vector3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
const subtract = (a: Vector3, b: Vector3): Vector3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const scale = (a: Vector3, factor: number): Vector3 => [
  a[0] * factor,
  a[1] * factor,
  a[2] * factor,
];
const dot = (a: Vector3, b: Vector3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const magnitude = (a: Vector3) => Math.hypot(a[0], a[1], a[2]);

function stateFor(body: Body, date: Date) {
  const state = RotateState(EQUATOR_TO_ECLIPTIC, HelioState(body, date));
  return {
    position: [state.x, state.y, state.z] as Vector3,
    velocity: [state.vx, state.vy, state.vz] as Vector3,
  };
}

function stumpff(z: number) {
  if (z > 1e-7) {
    const root = Math.sqrt(z);
    return {
      c: (1 - Math.cos(root)) / z,
      s: (root - Math.sin(root)) / root ** 3,
    };
  }

  if (z < -1e-7) {
    const root = Math.sqrt(-z);
    return {
      c: (Math.cosh(root) - 1) / -z,
      s: (Math.sinh(root) - root) / root ** 3,
    };
  }

  // Series terms keep the solver smooth around the parabolic case.
  return {
    c: 1 / 2 - z / 24 + z ** 2 / 720,
    s: 1 / 6 - z / 120 + z ** 2 / 5_040,
  };
}

function solveLambert(
  departurePosition: Vector3,
  arrivalPosition: Vector3,
  timeOfFlightDays: number,
  longWay: boolean,
): LambertSolution | null {
  const r1 = magnitude(departurePosition);
  const r2 = magnitude(arrivalPosition);
  const cosine = Math.min(
    1,
    Math.max(-1, dot(departurePosition, arrivalPosition) / (r1 * r2)),
  );
  let transferAngle = Math.acos(cosine);
  if (longWay) transferAngle = Math.PI * 2 - transferAngle;
  const sine = Math.sin(transferAngle);
  const a = sine * Math.sqrt((r1 * r2) / (1 - cosine));
  if (!Number.isFinite(a) || Math.abs(a) < 1e-9) return null;

  const timeAt = (z: number) => {
    const { c, s } = stumpff(z);
    if (c <= 0) return null;
    const y = r1 + r2 + (a * (z * s - 1)) / Math.sqrt(c);
    if (y < 0) return null;
    return {
      y,
      time:
        ((y / c) ** 1.5 * s + a * Math.sqrt(y)) /
        Math.sqrt(SOLAR_MU_AU3_PER_DAY2),
    };
  };

  const minZ = -4 * Math.PI ** 2 + 1e-5;
  const maxZ = 4 * Math.PI ** 2 - 1e-5;
  const scans = 900;
  let lowerZ: number | null = null;
  let upperZ: number | null = null;
  let previousZ: number | null = null;
  let previousDifference: number | null = null;

  for (let index = 0; index <= scans; index += 1) {
    const z = minZ + (index / scans) * (maxZ - minZ);
    const result = timeAt(z);
    if (!result || !Number.isFinite(result.time)) continue;
    const difference = result.time - timeOfFlightDays;

    if (
      previousDifference !== null &&
      previousZ !== null &&
      previousDifference * difference <= 0
    ) {
      lowerZ = previousZ;
      upperZ = z;
      break;
    }

    previousZ = z;
    previousDifference = difference;
  }

  if (lowerZ === null || upperZ === null) return null;
  let bracketLow: number = lowerZ;
  let bracketHigh: number = upperZ;

  for (let iteration = 0; iteration < 64; iteration += 1) {
    const middleZ: number = (bracketLow + bracketHigh) / 2;
    const middle = timeAt(middleZ);
    const lower = timeAt(bracketLow);
    if (!middle || !lower) return null;

    if (
      (lower.time - timeOfFlightDays) *
        (middle.time - timeOfFlightDays) <=
      0
    ) {
      bracketHigh = middleZ;
    } else {
      bracketLow = middleZ;
    }
  }

  const solved = timeAt((bracketLow + bracketHigh) / 2);
  if (!solved) return null;
  const f = 1 - solved.y / r1;
  const g = a * Math.sqrt(solved.y / SOLAR_MU_AU3_PER_DAY2);
  const gDot = 1 - solved.y / r2;
  if (Math.abs(g) < 1e-10) return null;

  const departureVelocity = scale(
    subtract(arrivalPosition, scale(departurePosition, f)),
    1 / g,
  );
  const arrivalVelocity = scale(
    subtract(scale(arrivalPosition, gDot), departurePosition),
    1 / g,
  );

  // Earth and Mars both orbit prograde. Reject the retrograde mathematical
  // branch even if it has a shorter vector sum.
  if (cross(departurePosition, departureVelocity)[2] <= 0) return null;

  return { departureVelocity, arrivalVelocity };
}

type IntegratedState = {
  position: Vector3;
  velocity: Vector3;
};

function derivative(state: IntegratedState): IntegratedState {
  const radius = magnitude(state.position);
  return {
    position: state.velocity,
    velocity: scale(
      state.position,
      -SOLAR_MU_AU3_PER_DAY2 / radius ** 3,
    ),
  };
}

function advance(state: IntegratedState, delta: IntegratedState, step: number) {
  return {
    position: add(state.position, scale(delta.position, step)),
    velocity: add(state.velocity, scale(delta.velocity, step)),
  };
}

function rk4(state: IntegratedState, stepDays: number): IntegratedState {
  const k1 = derivative(state);
  const k2 = derivative(advance(state, k1, stepDays / 2));
  const k3 = derivative(advance(state, k2, stepDays / 2));
  const k4 = derivative(advance(state, k3, stepDays));

  return {
    position: add(
      state.position,
      scale(
        add(
          add(k1.position, scale(k2.position, 2)),
          add(scale(k3.position, 2), k4.position),
        ),
        stepDays / 6,
      ),
    ),
    velocity: add(
      state.velocity,
      scale(
        add(
          add(k1.velocity, scale(k2.velocity, 2)),
          add(scale(k3.velocity, 2), k4.velocity),
        ),
        stepDays / 6,
      ),
    ),
  };
}

function propagateTransfer(
  position: Vector3,
  velocity: Vector3,
  timeOfFlightDays: number,
) {
  const steps = 420;
  const stepDays = timeOfFlightDays / steps;
  let state = { position, velocity };
  const path: EclipticPoint[] = [
    { x: position[0], y: position[1], z: position[2] },
  ];

  for (let index = 0; index < steps; index += 1) {
    state = rk4(state, stepDays);
    path.push({
      x: state.position[0],
      y: state.position[1],
      z: state.position[2],
    });
  }

  return { path, finalPosition: state.position };
}

export function optimizeMarsTransfer(departureDate = new Date()): MarsTransfer {
  const earth = stateFor(Body.Earth, departureDate);
  const velocityScale = ASTRONOMICAL_UNIT_KM / DAY_SECONDS;

  type Candidate = {
    timeOfFlightDays: number;
    solution: LambertSolution;
    mars: ReturnType<typeof stateFor>;
    score: number;
  };

  const candidateAt = (timeOfFlightDays: number): Candidate | null => {
    const arrivalDate = new Date(
      departureDate.getTime() + timeOfFlightDays * DAY_SECONDS * 1_000,
    );
    const mars = stateFor(Body.Mars, arrivalDate);
    let best: Candidate | null = null;

    for (const longWay of [false, true]) {
      const solution = solveLambert(
        earth.position,
        mars.position,
        timeOfFlightDays,
        longWay,
      );
      if (!solution) continue;
      const departureExcess = magnitude(
        subtract(solution.departureVelocity, earth.velocity),
      );
      const arrivalExcess = magnitude(
        subtract(solution.arrivalVelocity, mars.velocity),
      );
      const score = departureExcess + arrivalExcess;
      if (!best || score < best.score) {
        best = { timeOfFlightDays, solution, mars, score };
      }
    }

    return best;
  };

  let best: Candidate | null = null;
  for (let days = 100; days <= 460; days += 3) {
    const candidate = candidateAt(days);
    if (candidate && (!best || candidate.score < best.score)) best = candidate;
  }

  if (!best) throw new Error("No current Earth–Mars Lambert transfer found");

  const coarseBest = best;
  for (
    let days = Math.max(90, coarseBest.timeOfFlightDays - 5);
    days <= Math.min(480, coarseBest.timeOfFlightDays + 5);
    days += 0.1
  ) {
    const candidate = candidateAt(days);
    if (candidate && candidate.score < best.score) best = candidate;
  }

  const arrivalDate = new Date(
    departureDate.getTime() + best.timeOfFlightDays * DAY_SECONDS * 1_000,
  );
  const propagated = propagateTransfer(
    earth.position,
    best.solution.departureVelocity,
    best.timeOfFlightDays,
  );
  const departureExcess =
    magnitude(subtract(best.solution.departureVelocity, earth.velocity)) *
    velocityScale;
  const arrivalExcess =
    magnitude(subtract(best.solution.arrivalVelocity, best.mars.velocity)) *
    velocityScale;

  return {
    departureDate,
    arrivalDate,
    timeOfFlightDays: best.timeOfFlightDays,
    path: propagated.path,
    arrivalMars: {
      x: best.mars.position[0],
      y: best.mars.position[1],
      z: best.mars.position[2],
    },
    departureVInfinityKmPerSecond: departureExcess,
    arrivalVInfinityKmPerSecond: arrivalExcess,
    totalVInfinityKmPerSecond: departureExcess + arrivalExcess,
    c3Km2PerSecond2: departureExcess ** 2,
    arrivalErrorKm:
      magnitude(subtract(propagated.finalPosition, best.mars.position)) *
      ASTRONOMICAL_UNIT_KM,
  };
}

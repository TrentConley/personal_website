type Vector3 = [number, number, number];

export type CelestialStar = {
  rightAscension: number;
  declination: number;
  magnitude: number;
  colorIndex: number | null;
};

type SkyProjectionOptions = {
  width: number;
  height: number;
  orbitProjection: number;
  orbitRotation: number;
  compact: boolean;
};

type CameraBasis = {
  center: Vector3;
  right: Vector3;
  down: Vector3;
  tangentX: number;
  tangentY: number;
};

// ICRS/J2000 equatorial to galactic rotation (IAU standard orientation).
const equatorialToGalactic = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

function smoothstep(edge0: number, edge1: number, value: number) {
  const mix = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return mix * mix * (3 - 2 * mix);
}

function normalize(vector: Vector3): Vector3 {
  const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vector3, b: Vector3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function combine(
  a: Vector3,
  aScale: number,
  b: Vector3,
  bScale: number,
  c?: Vector3,
  cScale = 0,
): Vector3 {
  return [
    a[0] * aScale + b[0] * bScale + (c?.[0] ?? 0) * cScale,
    a[1] * aScale + b[1] * bScale + (c?.[1] ?? 0) * cScale,
    a[2] * aScale + b[2] * bScale + (c?.[2] ?? 0) * cScale,
  ];
}

function equatorialVector(rightAscension: number, declination: number): Vector3 {
  const cosDeclination = Math.cos(declination);
  return [
    cosDeclination * Math.cos(rightAscension),
    cosDeclination * Math.sin(rightAscension),
    Math.sin(declination),
  ];
}

function toGalactic(vector: Vector3): Vector3 {
  return [
    equatorialToGalactic[0][0] * vector[0] +
      equatorialToGalactic[0][1] * vector[1] +
      equatorialToGalactic[0][2] * vector[2],
    equatorialToGalactic[1][0] * vector[0] +
      equatorialToGalactic[1][1] * vector[1] +
      equatorialToGalactic[1][2] * vector[2],
    equatorialToGalactic[2][0] * vector[0] +
      equatorialToGalactic[2][1] * vector[1] +
      equatorialToGalactic[2][2] * vector[2],
  ];
}

function buildCamera(
  options: SkyProjectionOptions,
  aspectRatio: number,
): CameraBasis {
  // The Galilean moons' Laplace-plane pole in the ICRF, from JPL.
  const planePole = equatorialVector(radians(268.1), radians(64.5));
  const equatorialNorth: Vector3 = [0, 0, 1];
  const planeX = normalize(cross(equatorialNorth, planePole));
  const planeY = normalize(cross(planePole, planeX));
  const viewCos = Math.cos(options.orbitRotation);
  const viewSin = Math.sin(options.orbitRotation);
  const unrolledRight = normalize(
    combine(planeX, viewCos, planeY, -viewSin),
  );
  const rotatedPlaneY = normalize(combine(planeX, viewSin, planeY, viewCos));
  const cameraTilt = Math.acos(clamp(options.orbitProjection, 0, 1));
  const unrolledDown = normalize(
    combine(
      rotatedPlaneY,
      Math.cos(cameraTilt),
      planePole,
      -Math.sin(cameraTilt),
    ),
  );
  const cameraForward = normalize(
    combine(
      rotatedPlaneY,
      Math.sin(cameraTilt),
      planePole,
      Math.cos(cameraTilt),
    ),
  );
  const horizontalFieldOfView = radians(options.compact ? 92 : 112);
  const tangentX = Math.tan(horizontalFieldOfView / 2);
  const displayRoll = radians(options.compact ? 15 : -145);
  const right = normalize(
    combine(
      unrolledRight,
      Math.cos(displayRoll),
      unrolledDown,
      -Math.sin(displayRoll),
    ),
  );
  const down = normalize(
    combine(
      unrolledRight,
      Math.sin(displayRoll),
      unrolledDown,
      Math.cos(displayRoll),
    ),
  );

  return {
    center: [-cameraForward[0], -cameraForward[1], -cameraForward[2]],
    right,
    down,
    tangentX,
    tangentY: tangentX / aspectRatio,
  };
}

function integerHash(x: number, y: number) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xMix = (x - x0) ** 2 * (3 - 2 * (x - x0));
  const yMix = (y - y0) ** 2 * (3 - 2 * (y - y0));
  const top =
    integerHash(x0, y0) * (1 - xMix) +
    integerHash(x0 + 1, y0) * xMix;
  const bottom =
    integerHash(x0, y0 + 1) * (1 - xMix) +
    integerHash(x0 + 1, y0 + 1) * xMix;
  return top * (1 - yMix) + bottom * yMix;
}

function fractalNoise(x: number, y: number) {
  return (
    valueNoise(x, y) * 0.57 +
    valueNoise(x * 2.03 + 17.1, y * 2.03 - 9.4) * 0.28 +
    valueNoise(x * 4.11 - 6.8, y * 4.11 + 12.7) * 0.15
  );
}

function wrapRadians(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function rayForScreen(x: number, y: number, camera: CameraBasis): Vector3 {
  return normalize(
    combine(
      camera.center,
      1,
      camera.right,
      x * camera.tangentX,
      camera.down,
      y * camera.tangentY,
    ),
  );
}

function galacticCoordinates(ray: Vector3) {
  const galactic = toGalactic(ray);
  return {
    longitude: Math.atan2(galactic[1], galactic[0]),
    latitude: Math.asin(clamp(galactic[2], -1, 1)),
  };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function starColor(colorIndex: number | null): [number, number, number] {
  if (colorIndex === null) return [239, 230, 216];

  const anchors: Array<[number, [number, number, number]]> = [
    [-0.35, [208, 218, 234]],
    [0.15, [238, 235, 226]],
    [0.75, [255, 226, 188]],
    [1.55, [255, 184, 118]],
    [2.1, [238, 142, 88]],
  ];
  const value = clamp(colorIndex, anchors[0][0], anchors[anchors.length - 1][0]);

  for (let index = 1; index < anchors.length; index += 1) {
    if (value <= anchors[index][0]) {
      const [leftValue, leftColor] = anchors[index - 1];
      const [rightValue, rightColor] = anchors[index];
      const mix = (value - leftValue) / (rightValue - leftValue);
      return leftColor.map((channel, channelIndex) =>
        Math.round(channel + (rightColor[channelIndex] - channel) * mix),
      ) as [number, number, number];
    }
  }

  return anchors[anchors.length - 1][1];
}

function drawProceduralStars(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: CameraBasis,
) {
  const random = seededRandom(0x71e2c95);
  const candidates = Math.round(
    clamp((width * height) / 28, 9000, 34000),
  );
  context.save();
  context.globalCompositeOperation = "screen";

  for (let index = 0; index < candidates; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const ray = rayForScreen((x / width) * 2 - 1, (y / height) * 2 - 1, camera);
    const { longitude, latitude } = galacticCoordinates(ray);
    const planeDensity = Math.exp(-Math.abs(latitude) / 0.16);
    const coreDensity = Math.exp(
      -Math.hypot(wrapRadians(longitude) / 0.8, latitude / 0.24),
    );
    if (random() > 0.06 + planeDensity * 0.62 + coreDensity * 0.15) continue;

    const warmth = random();
    const radius = 0.23 + planeDensity * 0.07 + random() ** 6 * 1.24;
    const alpha =
      0.16 + planeDensity * 0.08 + random() ** 2.8 * (0.52 + planeDensity * 0.2);
    const color =
      warmth > 0.84
        ? [242, 183, 125]
        : warmth < 0.07
          ? [211, 220, 229]
          : [239, 229, 211];
    context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawCatalogStars(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: CameraBasis,
  stars: CelestialStar[],
) {
  context.save();
  context.globalCompositeOperation = "screen";

  for (const star of stars) {
    const direction = equatorialVector(star.rightAscension, star.declination);
    const forward = dot(direction, camera.center);
    if (forward <= 0) continue;

    const normalizedX =
      dot(direction, camera.right) / (forward * camera.tangentX);
    const normalizedY =
      dot(direction, camera.down) / (forward * camera.tangentY);
    if (Math.abs(normalizedX) > 1.02 || Math.abs(normalizedY) > 1.02) continue;

    const x = ((normalizedX + 1) / 2) * width;
    const y = ((normalizedY + 1) / 2) * height;
    const brightness = clamp((6.5 - star.magnitude) / 7.96, 0, 1);
    const radius = 0.48 + brightness ** 1.9 * 2.7;
    const alpha = 0.52 + brightness * 0.46;
    const [red, green, blue] = starColor(star.colorIndex);

    if (star.magnitude < 1.6) {
      const glowRadius = radius * 4.8;
      const glow = context.createRadialGradient(x, y, 0, x, y, glowRadius);
      glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${alpha * 0.5})`);
      glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, glowRadius, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

export function parseHipparcosCatalog(source: string): CelestialStar[] {
  const lines = source.trim().split("\n");
  return lines.slice(1).flatMap((line) => {
    const [rightAscension, declination, magnitude, colorIndex] = line.split("\t");
    const parsedRightAscension = Number(rightAscension);
    const parsedDeclination = Number(declination);
    const parsedMagnitude = Number(magnitude);
    if (
      !Number.isFinite(parsedRightAscension) ||
      !Number.isFinite(parsedDeclination) ||
      !Number.isFinite(parsedMagnitude)
    ) {
      return [];
    }

    const parsedColorIndex = colorIndex === "" ? Number.NaN : Number(colorIndex);
    return [
      {
        rightAscension: radians(parsedRightAscension),
        declination: radians(parsedDeclination),
        magnitude: parsedMagnitude,
        colorIndex: Number.isFinite(parsedColorIndex) ? parsedColorIndex : null,
      },
    ];
  });
}

export function renderMilkyWay(
  options: SkyProjectionOptions,
  stars: CelestialStar[],
) {
  const outputScale = Math.min(
    1,
    1600 / options.width,
    1000 / options.height,
  );
  const outputWidth = Math.max(1, Math.round(options.width * outputScale));
  const outputHeight = Math.max(1, Math.round(options.height * outputScale));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;

  // The diffuse model is intentionally lower resolution; catalog stars are
  // drawn afterward at screen resolution so they remain crisp.
  const diffuseScale = 0.62;
  const diffuseWidth = Math.max(1, Math.round(outputWidth * diffuseScale));
  const diffuseHeight = Math.max(1, Math.round(outputHeight * diffuseScale));
  const diffuseCanvas = document.createElement("canvas");
  diffuseCanvas.width = diffuseWidth;
  diffuseCanvas.height = diffuseHeight;
  const diffuseContext = diffuseCanvas.getContext("2d");
  if (!diffuseContext) return null;

  const camera = buildCamera(options, outputWidth / outputHeight);
  const image = diffuseContext.createImageData(diffuseWidth, diffuseHeight);
  const pixels = image.data;

  for (let y = 0; y < diffuseHeight; y += 1) {
    const screenY = ((y + 0.5) / diffuseHeight) * 2 - 1;

    for (let x = 0; x < diffuseWidth; x += 1) {
      const screenX = ((x + 0.5) / diffuseWidth) * 2 - 1;
      const ray = rayForScreen(screenX, screenY, camera);
      const { longitude, latitude } = galacticCoordinates(ray);
      const coreLongitude = wrapRadians(longitude);
      const absoluteLatitude = Math.abs(latitude);
      const largeClouds = fractalNoise(
        longitude * 3.4 + 31.4,
        latitude * 3.4 - 16.8,
      );
      const fineClouds = fractalNoise(
        longitude * 10.8 - 8.1,
        latitude * 10.8 + 43.7,
      );
      const dustClouds = fractalNoise(
        longitude * 23.5 + 71.2,
        latitude * 23.5 - 29.6,
      );
      const structureNoise = fractalNoise(
        longitude * 9.4 - 51.3,
        latitude * 9.4 + 8.2,
      );
      const planeWidth = 0.145 + 0.055 * largeClouds;
      const thinDisk = Math.exp(-Math.pow(absoluteLatitude / planeWidth, 1.38));
      const thickDisk = Math.exp(-Math.pow(absoluteLatitude / 0.42, 1.14));
      const bulgeRadius = Math.hypot(coreLongitude / 0.72, latitude / 0.26);
      const bulge = Math.exp(-Math.pow(bulgeRadius, 1.08));
      const centerBias = 0.28 + 0.72 * Math.exp(-Math.abs(coreLongitude) / 1.2);
      const dustCenter =
        -0.008 +
        Math.sin(longitude * 2.35 + 0.4) * 0.015 +
        (largeClouds - 0.5) * 0.045;
      const dustLane = Math.exp(
        -Math.pow(
          Math.abs(latitude - dustCenter) /
            (0.022 + dustClouds * 0.021),
          1.42,
        ),
      );
      const patchyDust =
        thinDisk *
        smoothstep(0.44, 0.74, dustClouds) *
        (0.42 + structureNoise * 0.58);
      const centerLaneStrength =
        smoothstep(0.38, 0.74, structureNoise) *
        (0.12 + smoothstep(0.4, 0.75, dustClouds) * 0.43);
      const extinction = clamp(
        1 -
          dustLane * centerLaneStrength -
          patchyDust * 0.42,
        0.26,
        1,
      );
      const stellarClouds =
        largeClouds * 0.52 + fineClouds * 0.29 + structureNoise * 0.19;
      const cloudBrightness =
        0.17 + Math.pow(clamp(stellarClouds, 0, 1), 1.72) * 1.74;
      const galaxyLight =
        (thinDisk * (0.24 + centerBias * 0.52) +
          thickDisk * 0.052 +
          bulge * 0.78) *
        cloudBrightness *
        extinction;
      const warmCore = bulge * (0.2 + largeClouds * 0.2) * extinction;
      const edgeDistance = Math.hypot(screenX * 0.72, screenY * 0.7);
      const vignette = clamp(1.06 - edgeDistance * 0.32, 0.68, 1);
      const grain = (integerHash(x + 193, y - 271) - 0.5) * 2.2;
      const stellarGrain =
        thinDisk *
        Math.pow(integerHash(x * 3 + 617, y * 3 - 389), 13) *
        (24 + centerBias * 24 + bulge * 34);
      const offset = (y * diffuseWidth + x) * 4;

      pixels[offset] = clamp(
        (2.6 +
          galaxyLight * 166 +
          warmCore * 48 +
          stellarGrain +
          grain) *
          vignette,
        0,
        255,
      );
      pixels[offset + 1] = clamp(
        (2.5 +
          galaxyLight * 123 +
          warmCore * 28 +
          stellarGrain * 0.9 +
          grain * 0.74) *
          vignette,
        0,
        255,
      );
      pixels[offset + 2] = clamp(
        (3.5 +
          galaxyLight * 88 +
          warmCore * 12 +
          stellarGrain * 0.74 +
          grain * 0.62) *
          vignette,
        0,
        255,
      );
      pixels[offset + 3] = 255;
    }
  }

  diffuseContext.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(diffuseCanvas, 0, 0, outputWidth, outputHeight);
  drawProceduralStars(context, outputWidth, outputHeight, camera);
  drawCatalogStars(context, outputWidth, outputHeight, camera, stars);
  return canvas;
}

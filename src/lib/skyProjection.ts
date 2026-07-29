type Vector3 = [number, number, number];

export type CelestialStar = {
  rightAscension: number;
  declination: number;
  magnitude: number;
  colorIndex: number | null;
};

export type RenderedSky = {
  diffuse: HTMLCanvasElement;
  stars: HTMLCanvasElement;
};

type SkyProjectionOptions = {
  width: number;
  height: number;
  pixelRatio: number;
  orbitProjection: number;
  orbitRotation: number;
  compact: boolean;
};

export type CelestialProjectionOptions = Pick<
  SkyProjectionOptions,
  "width" | "height" | "orbitProjection" | "orbitRotation" | "compact"
>;

type CameraBasis = {
  center: Vector3;
  right: Vector3;
  down: Vector3;
  tangentX: number;
  tangentY: number;
  offsetX: number;
  offsetY: number;
};

type SourcePixels = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

// ICRS/J2000 equatorial to galactic rotation (IAU standard orientation).
const equatorialToGalactic = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

const sourcePixelCache = new WeakMap<HTMLImageElement, SourcePixels>();
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);
const positiveModulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

function opticalVignette(normalizedX: number, normalizedY: number) {
  const edgeDistance = Math.hypot(normalizedX * 0.72, normalizedY * 0.7);
  const baseFalloff = clamp(1.08 - edgeDistance * 0.5, 0.48, 1);
  const cornerProgress = clamp((edgeDistance - 0.48) / 0.52, 0, 1);
  return baseFalloff * (1 - cornerProgress ** 2 * 0.22);
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
  const horizontalFieldOfView = radians(options.compact ? 112 : 112);
  const tangentX = Math.tan(horizontalFieldOfView / 2);
  const displayRoll = radians(options.compact ? 30 : -145);
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
    // Portrait composition uses an accurate off-axis projection so the
    // Galactic plane becomes an edge element instead of running through the
    // interface. Celestial labels use the same offset below.
    offsetX: 0,
    offsetY: options.compact ? 0.45 : 0,
  };
}

export function projectCelestialCoordinate(
  rightAscensionDegrees: number,
  declinationDegrees: number,
  options: CelestialProjectionOptions,
) {
  const camera = buildCamera(options as SkyProjectionOptions, options.width / options.height);
  const direction = equatorialVector(
    radians(rightAscensionDegrees),
    radians(declinationDegrees),
  );
  const forward = dot(direction, camera.center);

  if (forward <= 0) return null;

  const normalizedX =
    dot(direction, camera.right) / (forward * camera.tangentX) - camera.offsetX;
  const normalizedY =
    dot(direction, camera.down) / (forward * camera.tangentY) - camera.offsetY;

  return {
    x: (normalizedX + 1) / 2,
    y: (normalizedY + 1) / 2,
    visible: Math.abs(normalizedX) <= 1.02 && Math.abs(normalizedY) <= 1.02,
  };
}

function rayForScreen(x: number, y: number, camera: CameraBasis): Vector3 {
  return normalize(
    combine(
      camera.center,
      1,
      camera.right,
      (x + camera.offsetX) * camera.tangentX,
      camera.down,
      (y + camera.offsetY) * camera.tangentY,
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

function sourcePixelsFor(image: HTMLImageElement): SourcePixels | null {
  const cached = sourcePixelCache.get(image);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const source = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = {
    width: source.width,
    height: source.height,
    pixels: source.data,
  };
  sourcePixelCache.set(image, result);
  return result;
}

function sampleSource(
  source: SourcePixels,
  longitude: number,
  latitude: number,
): [number, number, number] {
  // The Gaia EDR3 map is galactic equirectangular with longitude increasing
  // toward the left, so Galactic Centre is at the texture midpoint.
  const sourceX =
    positiveModulo(0.5 - longitude / (Math.PI * 2), 1) * source.width;
  const sourceY =
    clamp(0.5 - latitude / Math.PI, 0, 1) * (source.height - 1);
  const x0 = Math.floor(sourceX) % source.width;
  const y0 = Math.floor(sourceY);
  const x1 = (x0 + 1) % source.width;
  const y1 = Math.min(y0 + 1, source.height - 1);
  const xMix = sourceX - Math.floor(sourceX);
  const yMix = sourceY - y0;
  const color: [number, number, number] = [0, 0, 0];

  for (let channel = 0; channel < 3; channel += 1) {
    const topLeft = source.pixels[(y0 * source.width + x0) * 4 + channel];
    const topRight = source.pixels[(y0 * source.width + x1) * 4 + channel];
    const bottomLeft = source.pixels[(y1 * source.width + x0) * 4 + channel];
    const bottomRight = source.pixels[(y1 * source.width + x1) * 4 + channel];
    const top = topLeft + (topRight - topLeft) * xMix;
    const bottom = bottomLeft + (bottomRight - bottomLeft) * xMix;
    color[channel] = top + (bottom - top) * yMix;
  }

  return color;
}

function starColor(colorIndex: number | null): [number, number, number] {
  if (colorIndex === null) return [247, 243, 235];

  const anchors: Array<[number, [number, number, number]]> = [
    [-0.35, [194, 216, 255]],
    [0.15, [244, 244, 248]],
    [0.75, [255, 230, 190]],
    [1.55, [255, 190, 135]],
    [2.1, [255, 155, 115]],
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

function drawCatalogStars(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  renderScale: number,
  camera: CameraBasis,
  stars: CelestialStar[],
  compact: boolean,
) {
  context.save();
  context.globalCompositeOperation = "screen";

  for (const star of stars) {
    // On a phone, desktop catalog density collapses thousands of separate
    // points into noise. Preserve only the stars that would actually read as
    // distinct naked-eye objects at this scale.
    if (compact && star.magnitude > 5.6) continue;

    const direction = equatorialVector(star.rightAscension, star.declination);
    const forward = dot(direction, camera.center);
    if (forward <= 0) continue;

    const normalizedX =
      dot(direction, camera.right) / (forward * camera.tangentX) - camera.offsetX;
    const normalizedY =
      dot(direction, camera.down) / (forward * camera.tangentY) - camera.offsetY;
    if (Math.abs(normalizedX) > 1.02 || Math.abs(normalizedY) > 1.02) continue;

    const x = ((normalizedX + 1) / 2) * width;
    const y = ((normalizedY + 1) / 2) * height;
    const vignette = opticalVignette(normalizedX, normalizedY);

    if (compact && star.magnitude > 4.6) {
      const faintVisibility = clamp((5.6 - star.magnitude) / 1, 0, 1);
      const faintRadius = (0.3 + faintVisibility * 0.08) * renderScale;
      const faintAlpha = (0.2 + faintVisibility * 0.25) * vignette;
      const [red, green, blue] = starColor(star.colorIndex);
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${faintAlpha})`;
      context.beginPath();
      context.arc(x, y, faintRadius, 0, Math.PI * 2);
      context.fill();
      continue;
    }

    if (star.magnitude > 6.5) {
      const visibility = clamp((8.5 - star.magnitude) / 2, 0, 1);
      const size = Math.max(
        1.08,
        (0.5 + visibility ** 0.85 * 0.56) * renderScale,
      ) * 1.04;
      const alpha = clamp(
        (0.37 + visibility * 0.46) * vignette * 1.18,
        0,
        1,
      );
      const [red, green, blue] = starColor(star.colorIndex);
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      context.fillRect(x - size / 2, y - size / 2, size, size);
      continue;
    }

    const brightness = clamp((6.5 - star.magnitude) / 7.96, 0, 1);
    const radius = Math.max(
      0.82,
      (0.58 + brightness ** 1.85 * 2.28) * renderScale,
    );
    const alpha = clamp(
      (0.88 + brightness * 0.12) * vignette * 1.18,
      0,
      1,
    );
    const [red, green, blue] = starColor(star.colorIndex);

    if (star.magnitude < 2.8) {
      const glowRadius = radius * (star.magnitude < 0.7 ? 2.8 : 1.9);
      const glow = context.createRadialGradient(x, y, 0, x, y, glowRadius);
      glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${alpha * 0.18})`);
      glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, glowRadius, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * 0.88})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    // A very small neutral core reads as a focused point source after the
    // high-density backing canvas is reduced to CSS pixels. Color remains in
    // the surrounding stellar disc instead of appearing as a digital fringe.
    if (star.magnitude < 4.4) {
      const coreRadius = Math.max(0.32 * renderScale, radius * 0.32);
      context.fillStyle = `rgba(255, 253, 248, ${alpha * 0.92})`;
      context.beginPath();
      context.arc(x, y, coreRadius, 0, Math.PI * 2);
      context.fill();
    }
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

export function parseGaiaFaintCatalog(source: ArrayBuffer): CelestialStar[] {
  const recordSize = 6;
  const view = new DataView(source);
  const stars: CelestialStar[] = [];

  for (
    let offset = 0;
    offset + recordSize <= view.byteLength;
    offset += recordSize
  ) {
    const rightAscension =
      (view.getUint16(offset, true) / 65535) * Math.PI * 2;
    const declination =
      (view.getUint16(offset + 2, true) / 65535) * Math.PI - Math.PI / 2;
    const magnitude = 6.5 + (view.getUint8(offset + 4) / 255) * 2;
    const encodedColor = view.getUint8(offset + 5);
    const colorIndex =
      encodedColor === 255 ? null : (encodedColor / 254) * 4 - 0.5;
    stars.push({ rightAscension, declination, magnitude, colorIndex });
  }

  return stars;
}

export function renderMilkyWay(
  skyImage: HTMLImageElement,
  options: SkyProjectionOptions,
  stars: CelestialStar[],
): RenderedSky | null {
  const source = sourcePixelsFor(skyImage);
  if (!source) return null;

  // Preserve a genuinely high-density backing surface on Retina laptops while
  // keeping a bounded memory footprint on very large external displays.
  const outputHeightCap = options.compact ? 3000 : 2400;
  const outputScale = Math.min(
    options.pixelRatio,
    3840 / options.width,
    outputHeightCap / options.height,
  );
  const outputWidth = Math.max(1, Math.round(options.width * outputScale));
  const outputHeight = Math.max(1, Math.round(options.height * outputScale));
  const diffuseOutput = document.createElement("canvas");
  diffuseOutput.width = outputWidth;
  diffuseOutput.height = outputHeight;
  const diffuseOutputContext = diffuseOutput.getContext("2d");
  if (!diffuseOutputContext) return null;

  // The photographic layer used to render at CSS-pixel resolution and then be
  // enlarged into the Retina canvas. Reproject it above CSS resolution so the
  // dust lanes and integrated star clouds retain their fine structure.
  const diffuseWidthCap = options.compact ? 3600 : 2560;
  const diffuseHeightCap = options.compact ? 3000 : 2200;
  const diffuseScale = Math.min(
    outputScale,
    diffuseWidthCap / options.width,
    diffuseHeightCap / options.height,
  );
  const diffuseWidth = Math.max(1, Math.round(options.width * diffuseScale));
  const diffuseHeight = Math.max(1, Math.round(options.height * diffuseScale));
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
      const [sourceRed, sourceGreen, sourceBlue] = sampleSource(
        source,
        longitude,
        latitude,
      );
      const luminance =
        (sourceRed * 0.24 + sourceGreen * 0.64 + sourceBlue * 0.12) / 255;
      // The Gaia panorama contains the correct structure but its display
      // encoding is much flatter than a long-exposure photograph. A gentler
      // toe reveals the dim stellar clouds and dust surrounding the bright
      // Galactic plane instead of reducing them to a narrow gray streak.
      const signal = Math.pow(
        clamp((luminance - 0.025) / 0.975, 0, 1),
        1.6,
      );
      const highlight = signal ** 1.7;
      const midtone = signal * (1 - signal) * 4;
      const warmth = clamp((sourceRed - sourceBlue) / 255, -0.2, 0.32);
      const coolness = Math.max(0, -warmth);
      const density = signal * 136 + highlight * 42 + midtone * 5;
      const vignette = opticalVignette(screenX, screenY);
      const offset = (y * diffuseWidth + x) * 4;

      pixels[offset] = clamp(
        (12 + density * 1.27 + highlight * 7 + warmth * signal * 78) *
          vignette,
        0,
        255,
      );
      pixels[offset + 1] = clamp(
        (7.5 + density * 0.88 + highlight * 24 + warmth * signal * 10) *
          vignette,
        0,
        255,
      );
      pixels[offset + 2] = clamp(
        (
          6 +
          density * 0.7 +
          highlight * 44 -
          warmth * signal * 34 +
          coolness * signal * 74
        ) *
          vignette,
        0,
        255,
      );
      pixels[offset + 3] = 255;
    }
  }

  diffuseContext.putImageData(image, 0, 0);
  diffuseOutputContext.imageSmoothingEnabled = true;
  diffuseOutputContext.imageSmoothingQuality = "high";
  diffuseOutputContext.drawImage(
    diffuseCanvas,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const starOutput = document.createElement("canvas");
  starOutput.width = outputWidth;
  starOutput.height = outputHeight;
  const starOutputContext = starOutput.getContext("2d");
  if (!starOutputContext) return null;
  drawCatalogStars(
    starOutputContext,
    outputWidth,
    outputHeight,
    outputScale,
    camera,
    stars,
    options.compact,
  );

  return { diffuse: diffuseOutput, stars: starOutput };
}

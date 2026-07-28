import { useEffect, useRef } from "react";

export type OrbitPanel = "projects" | "writing" | "contact";

type OrbitalFieldProps = {
  activePanel: OrbitPanel | null;
  onSelect: (panel: OrbitPanel) => void;
};

type Star = {
  x: number;
  y: number;
  radius: number;
  depth: number;
  phase: number;
};

const orbitItems: Array<{
  id: OrbitPanel;
  label: string;
  shortLabel: string;
  phase: number;
}> = [
  { id: "projects", label: "Projects", shortLabel: "P", phase: 1.55 },
  { id: "writing", label: "Writing", shortLabel: "W", phase: 4.7 },
  { id: "contact", label: "Contact", shortLabel: "C", phase: 3 },
];

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
    let stars: Star[] = [];

    const orbitGeometry = () => {
      const compact = width < 640;
      const short = height < 700;
      if (compact) {
        const maxRadius = Math.max(132, width / 2 - 27);
        return [
          {
            rx: maxRadius * 0.92,
            ry: short ? 86 : 104,
            rotation: -0.1,
            speed: 0.000006,
          },
          {
            rx: maxRadius * 0.97,
            ry: short ? 125 : 145,
            rotation: 0.08,
            speed: -0.0000045,
          },
          {
            rx: maxRadius,
            ry: short ? 160 : 182,
            rotation: -0.04,
            speed: 0.0000032,
          },
        ];
      }

      const scale = Math.min(width / 1440, height / 850, 1);
      return [
        { rx: 470 * scale, ry: 185 * scale, rotation: -0.12, speed: 0.0000055 },
        { rx: 585 * scale, ry: 250 * scale, rotation: 0.09, speed: -0.0000038 },
        { rx: 690 * scale, ry: 315 * scale, rotation: -0.04, speed: 0.0000028 },
      ];
    };

    const makeStars = () => {
      const count = Math.min(150, Math.max(80, Math.round(width / 9)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random(),
        y: Math.random(),
        radius: Math.random() * 1.05 + 0.2,
        depth: Math.random() * 0.8 + 0.2,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      makeStars();
      if (reduceMotion) draw(0);
    };

    const orbitPoint = (
      angle: number,
      orbit: ReturnType<typeof orbitGeometry>[number],
      centerX: number,
      centerY: number,
    ) => {
      const localX = Math.cos(angle) * orbit.rx;
      const localY = Math.sin(angle) * orbit.ry;
      const cos = Math.cos(orbit.rotation);
      const sin = Math.sin(orbit.rotation);
      return {
        x: centerX + localX * cos - localY * sin,
        y: centerY + localX * sin + localY * cos,
      };
    };

    function draw(timestamp: number) {
      ctx.clearRect(0, 0, width, height);
      pointer.x += (pointer.targetX - pointer.x) * 0.035;
      pointer.y += (pointer.targetY - pointer.y) * 0.035;

      for (const star of stars) {
        const drift = reduceMotion ? 0 : timestamp * 0.002 * star.depth;
        const x =
          ((star.x * width + drift + width) % width) + pointer.x * 10 * star.depth;
        const y = star.y * height + pointer.y * 7 * star.depth;
        const alpha = reduceMotion
          ? 0.5
          : 0.36 + Math.sin(timestamp * 0.0012 + star.phase) * 0.14;
        ctx.fillStyle = `rgba(239, 231, 213, ${alpha * star.depth})`;
        ctx.beginPath();
        ctx.arc(x, y, star.radius * star.depth, 0, Math.PI * 2);
        ctx.fill();
      }

      const compact = width < 640;
      const centerX = width / 2 + pointer.x * 9;
      const centerY = height * (compact ? 0.46 : 0.5) + pointer.y * 7;
      const orbits = orbitGeometry();
      const exclusionX = compact ? Math.min(width * 0.38, 150) : Math.min(width * 0.3, 330);
      const exclusionY = compact ? 58 : 78;

      ctx.save();
      ctx.translate(centerX, centerY);
      for (const orbit of orbits) {
        ctx.beginPath();
        let drawing = false;
        const segments = 260;

        for (let segment = 0; segment <= segments; segment += 1) {
          const angle = (segment / segments) * Math.PI * 2;
          const x = Math.cos(angle) * orbit.rx;
          const y = Math.sin(angle) * orbit.ry;
          const cos = Math.cos(orbit.rotation);
          const sin = Math.sin(orbit.rotation);
          const rotatedX = x * cos - y * sin;
          const rotatedY = x * sin + y * cos;
          const insideNameGap =
            Math.pow(rotatedX / exclusionX, 4) +
              Math.pow(rotatedY / exclusionY, 4) <
            1;

          if (insideNameGap) {
            drawing = false;
          } else if (drawing) {
            ctx.lineTo(rotatedX, rotatedY);
          } else {
            ctx.moveTo(rotatedX, rotatedY);
            drawing = true;
          }
        }

        ctx.strokeStyle = "rgba(231, 219, 196, 0.16)";
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 82);
      core.addColorStop(0, "rgba(255, 238, 202, 0.15)");
      core.addColorStop(0.18, "rgba(224, 111, 70, 0.06)");
      core.addColorStop(1, "rgba(6, 6, 8, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, 82, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      orbitItems.forEach((item, index) => {
        const node = nodeRefs.current[index];
        if (!node) return;
        const orbit = orbits[index];
        const angle = item.phase + (reduceMotion ? 0 : timestamp * orbit.speed);
        const point = orbitPoint(angle, orbit, centerX, centerY);
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
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointer);
    window.addEventListener("blur", resetPointer);
    if (!reduceMotion) frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
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
          aria-label={item.label}
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

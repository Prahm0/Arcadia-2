"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/hooks";

interface StarfieldProps {
  className?: string;
  count?: number;
  mobileCount?: number;
  constellationCount?: number;
  seed?: number;
  parallax?: boolean;
  /** Bias stars towards the centre for non-hero uses. */
  concentrate?: boolean;
  /** Global opacity multiplier. */
  intensity?: number;
  /** Proportion of peach and amber stars, from 0 to 1. */
  warmStarRatio?: number;
  /** Radians per second for the field's very slow drift cycle. */
  driftSpeed?: number;
}

interface ConstellationDefinition {
  indices: number[];
  edges: Array<[number, number]>;
}

const MAX_DPR = 2;
const FIELD_OVERSCAN = 1.14;
const PARALLAX_PX = 7;
const STAR_COLOURS = [
  new THREE.Color("#ffffff"),
  new THREE.Color("#dceeff"),
  new THREE.Color("#ffc28a"),
  new THREE.Color("#ffd9b0"),
];

const CONSTELLATION_CENTRES: Array<[number, number]> = [
  [-0.79, 0.7], [-0.33, 0.78], [0.18, 0.69], [0.7, 0.75], [-0.76, 0.12],
  [0.72, 0.14], [-0.7, -0.61], [-0.16, -0.72], [0.43, -0.58], [0.82, -0.46],
];
const SHAPES: Array<Array<[number, number]>> = [
  [[-0.13, 0.02], [-0.04, 0.1], [0.05, 0.04], [0.12, 0.13]],
  [[-0.11, 0.08], [-0.03, -0.03], [0.07, 0.05], [0.13, -0.07], [0.02, -0.13]],
  [[-0.12, -0.04], [-0.04, 0.08], [0.05, -0.01], [0.13, 0.07]],
  [[-0.11, 0.1], [0.01, 0.04], [0.11, 0.11], [0.06, -0.05], [-0.05, -0.11]],
  [[-0.14, -0.03], [-0.04, 0.07], [0.04, -0.02], [0.14, 0.06]],
];

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute float aTwinkleSpeed;
  varying vec3 vColour;
  varying float vAlpha;
  uniform float uTime;
  uniform float uPixelRatio;

  void main() {
    float twinkle = 0.88 + 0.12 * sin(aPhase + uTime * aTwinkleSpeed);
    vColour = color;
    vAlpha = aAlpha * twinkle;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uPixelRatio * (0.92 + 0.08 * twinkle));
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColour;
  varying float vAlpha;

  void main() {
    vec2 centred = gl_PointCoord - vec2(0.5);
    float radius = length(centred) * 2.0;
    if (radius > 1.0) discard;
    float core = 1.0 - smoothstep(0.0, 0.2, radius);
    float halo = 1.0 - smoothstep(0.08, 1.0, radius);
    gl_FragColor = vec4(vColour, (core * 0.82 + halo * 0.48) * vAlpha);
  }
`;

/**
 * Full-bleed WebGL starfield. The points and lines share one scene group, so
 * drift and pointer parallax can never pull constellation edges apart.
 */
export default function Starfield({
  className,
  count = 2400,
  mobileCount = 1600,
  constellationCount = 0,
  seed = 11,
  parallax = false,
  concentrate = false,
  intensity = 1,
  warmStarRatio = 0.15,
  driftSpeed = 0.008,
}: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    const field = new THREE.Group();
    scene.add(field);

    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    const starCount = isMobile ? mobileCount : count;
    const groupCount = Math.max(0, Math.min(
      isMobile ? Math.ceil(constellationCount * 0.6) : constellationCount,
      CONSTELLATION_CENTRES.length,
    ));
    const random = mulberry32(seed);
    const data = buildStarData(
      starCount,
      groupCount,
      random,
      concentrate,
      intensity,
      warmStarRatio,
    );

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(data.colours, 3));
    starGeometry.setAttribute("aSize", new THREE.BufferAttribute(data.sizes, 1));
    starGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(data.alphas, 1));
    starGeometry.setAttribute("aPhase", new THREE.BufferAttribute(data.phases, 1));
    starGeometry.setAttribute("aTwinkleSpeed", new THREE.BufferAttribute(data.twinkleSpeeds, 1));
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, MAX_DPR) },
      },
      vertexShader,
      fragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    field.add(new THREE.Points(starGeometry, starMaterial));

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(
      buildLinePositions(data.positions, data.constellations), 3,
    ));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xdceeff,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    field.add(new THREE.LineSegments(lineGeometry, lineMaterial));

    const shootingGeometry = new THREE.BufferGeometry();
    shootingGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const shootingMaterial = new THREE.LineBasicMaterial({
      color: 0xdceeff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const shootingStar = new THREE.Line(shootingGeometry, shootingMaterial);
    shootingStar.visible = false;
    scene.add(shootingStar);

    let width = 1;
    let height = 1;
    let raf = 0;
    let inView = true;
    let pageVisible = document.visibilityState === "visible";
    let shootingStartedAt = -1;
    let shootingFrom: [number, number] = [0, 0];
    let shootingVector: [number, number] = [0, 0];
    let nextShootingStar = randomBetween(random, 10, 20);
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const clock = new THREE.Clock();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      starMaterial.uniforms.uPixelRatio.value = pixelRatio;
      renderer.render(scene, camera);
    };

    const updateShootingStar = (elapsed: number) => {
      if (reduced) return;
      if (shootingStartedAt < 0) {
        if (elapsed < nextShootingStar) return;
        shootingStartedAt = elapsed;
        shootingFrom = [randomBetween(random, -1.05, 0.55), randomBetween(random, 0.18, 0.95)];
        const length = randomBetween(random, 0.52, 0.82);
        shootingVector = [length, -length * randomBetween(random, 0.35, 0.62)];
        shootingStar.visible = true;
        return;
      }

      const progress = (elapsed - shootingStartedAt) / 1.05;
      if (progress >= 1) {
        shootingStar.visible = false;
        shootingMaterial.opacity = 0;
        shootingStartedAt = -1;
        nextShootingStar = elapsed + randomBetween(random, 10, 20);
        return;
      }

      const eased = 1 - (1 - progress) ** 3;
      const headX = shootingFrom[0] + shootingVector[0] * eased;
      const headY = shootingFrom[1] + shootingVector[1] * eased;
      const tailScale = 0.2 * Math.min(1, progress * 6);
      const positions = shootingGeometry.attributes.position.array as Float32Array;
      positions[0] = headX - shootingVector[0] * tailScale;
      positions[1] = headY - shootingVector[1] * tailScale;
      positions[2] = 0.03;
      positions[3] = headX;
      positions[4] = headY;
      positions[5] = 0.03;
      shootingGeometry.attributes.position.needsUpdate = true;
      shootingMaterial.opacity = 0.42 * Math.sin(Math.PI * progress);
    };

    const render = () => {
      const elapsed = clock.getElapsedTime();
      starMaterial.uniforms.uTime.value = elapsed;
      if (!reduced) {
        pointer.x += (pointer.targetX - pointer.x) * 0.035;
        pointer.y += (pointer.targetY - pointer.y) * 0.035;
        field.position.x = pointer.x + Math.sin(elapsed * driftSpeed) * 0.022;
        field.position.y = pointer.y + Math.cos(elapsed * driftSpeed * 0.73) * 0.014;
        updateShootingStar(elapsed);
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };

    const start = () => {
      if (raf || !inView || !pageVisible) return;
      clock.start();
      raf = requestAnimationFrame(render);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
      clock.stop();
    };
    const sync = () => (inView && pageVisible ? start() : stop());
    const onPointerMove = (event: PointerEvent) => {
      if (!parallax || reduced || event.pointerType === "touch") return;
      pointer.targetX = ((event.clientX / width) * 2 - 1) * (PARALLAX_PX / width) * 2;
      pointer.targetY = -((event.clientY / height) * 2 - 1) * (PARALLAX_PX / height) * 2;
    };
    const onPointerLeave = () => {
      pointer.targetX = 0;
      pointer.targetY = 0;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        sync();
      },
      { rootMargin: "100px 0px" },
    );
    intersectionObserver.observe(canvas);
    const onVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (parallax && !reduced) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
    }

    resize();
    canvas.style.opacity = "1";
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      starGeometry.dispose();
      starMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      shootingGeometry.dispose();
      shootingMaterial.dispose();
      renderer.dispose();
    };
  }, [
    concentrate,
    constellationCount,
    count,
    driftSpeed,
    intensity,
    mobileCount,
    parallax,
    reduced,
    seed,
    warmStarRatio,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 block h-full w-full opacity-0 transition-opacity duration-[1400ms] ease-out",
        className,
      )}
    />
  );
}

function buildStarData(
  count: number,
  constellationCount: number,
  random: () => number,
  concentrate: boolean,
  intensity: number,
  warmStarRatio: number,
) {
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const phases = new Float32Array(count);
  const twinkleSpeeds = new Float32Array(count);
  const constellations: ConstellationDefinition[] = [];

  const setStar = (
    starIndex: number,
    x: number,
    y: number,
    size: number,
    alpha: number,
    allowWarm: boolean,
  ) => {
    const offset = starIndex * 3;
    positions[offset] = concentrate ? x * randomBetween(random, 0.58, 0.94) : x;
    positions[offset + 1] = concentrate ? y * randomBetween(random, 0.58, 0.94) : y;
    positions[offset + 2] = randomBetween(random, -0.06, 0.06);

    const warm = allowWarm && random() < clamp(warmStarRatio, 0, 1);
    const colourIndex = warm ? (random() < 0.48 ? 2 : 3) : (random() < 0.58 ? 0 : 1);
    const colour = STAR_COLOURS[colourIndex];
    colours[offset] = colour.r;
    colours[offset + 1] = colour.g;
    colours[offset + 2] = colour.b;
    sizes[starIndex] = size;
    alphas[starIndex] = alpha * clamp(intensity, 0, 1);
    phases[starIndex] = random() * Math.PI * 2;
    twinkleSpeeds[starIndex] = randomBetween(random, 0.28, 0.68);
  };

  let index = 0;
  for (let groupIndex = 0; groupIndex < constellationCount && index < count; groupIndex += 1) {
    const shape = SHAPES[groupIndex % SHAPES.length];
    const centre = CONSTELLATION_CENTRES[groupIndex];
    const indices: number[] = [];
    for (const [offsetX, offsetY] of shape) {
      if (index >= count) break;
      setStar(
        index,
        centre[0] + offsetX * randomBetween(random, 0.78, 1.12),
        centre[1] + offsetY * randomBetween(random, 0.78, 1.12),
        randomBetween(random, 3.2, 5.4),
        randomBetween(random, 0.78, 0.98),
        false,
      );
      indices.push(index++);
    }
    const edges: Array<[number, number]> = [];
    for (let edge = 0; edge < indices.length - 1; edge += 1) edges.push([edge, edge + 1]);
    if (indices.length >= 5 && groupIndex % 2 === 1) edges.push([1, indices.length - 1]);
    constellations.push({ indices, edges });
  }

  const clusterCentres = Array.from({ length: 16 }, () => [
    randomBetween(random, -FIELD_OVERSCAN, FIELD_OVERSCAN),
    randomBetween(random, -FIELD_OVERSCAN, FIELD_OVERSCAN),
  ] as const);

  for (; index < count; index += 1) {
    let x = randomBetween(random, -FIELD_OVERSCAN, FIELD_OVERSCAN);
    let y = randomBetween(random, -FIELD_OVERSCAN, FIELD_OVERSCAN);
    if (random() < 0.24) {
      const cluster = clusterCentres[Math.floor(random() * clusterCentres.length)];
      x = clamp(cluster[0] + gaussian(random) * 0.085, -FIELD_OVERSCAN, FIELD_OVERSCAN);
      y = clamp(cluster[1] + gaussian(random) * 0.085, -FIELD_OVERSCAN, FIELD_OVERSCAN);
    }

    const isLarge = random() < 0.03;
    const size = isLarge
      ? randomBetween(random, 5, 8)
      : random() < 0.78
        ? randomBetween(random, 0.65, 1.7)
        : randomBetween(random, 1.7, 3.1);
    setStar(
      index,
      x,
      y,
      size,
      isLarge ? randomBetween(random, 0.62, 0.96) : randomBetween(random, 0.24, 0.76),
      true,
    );
  }

  return { positions, colours, sizes, alphas, phases, twinkleSpeeds, constellations };
}

function buildLinePositions(
  positions: Float32Array,
  constellations: ConstellationDefinition[],
) {
  const segmentCount = constellations.reduce(
    (total, constellation) => total + constellation.edges.length,
    0,
  );
  const linePositions = new Float32Array(segmentCount * 6);
  let cursor = 0;

  for (const constellation of constellations) {
    for (const [fromLocal, toLocal] of constellation.edges) {
      const from = constellation.indices[fromLocal] * 3;
      const to = constellation.indices[toLocal] * 3;
      linePositions[cursor++] = positions[from];
      linePositions[cursor++] = positions[from + 1];
      linePositions[cursor++] = 0.02;
      linePositions[cursor++] = positions[to];
      linePositions[cursor++] = positions[to + 1];
      linePositions[cursor++] = 0.02;
    }
  }
  return linePositions;
}

function gaussian(random: () => number) {
  const u = Math.max(random(), Number.EPSILON);
  const v = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function randomBetween(random: () => number, min: number, max: number) {
  return min + (max - min) * random();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

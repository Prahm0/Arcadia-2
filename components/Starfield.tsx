"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "framer-motion";
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
  /** Global opacity multiplier, 0–1. */
  intensity?: number;
  /** Scales star size and alpha above the default so the field reads instantly. */
  brightness?: number;
  /** Proportion of peach and amber stars, from 0 to 1. */
  warmStarRatio?: number;
  /** Radians per second for the field's very slow drift cycle. */
  driftSpeed?: number;
  /** Scroll progress 0–1 driving the reveal. Read through a ref, never a dependency. */
  progress?: MotionValue<number>;
  /** Word a subset of stars secretly spells, seen from the reveal angle. */
  revealWord?: string;
  /** Range of `progress` over which the field turns to the reveal angle. */
  revealRange?: [number, number];
  /** Per-star cursor push. Ignored for touch and reduced motion. */
  interactive?: boolean;
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

/* Reveal: the field turns from this tilt back to flat as the hero scrolls. */
const REVEAL_TILT_X = 0.873;
const REVEAL_TILT_Y = 0.524;
const BG_WEIGHT = 0.22;
const WORD_DEPTH = 1.1;
const BG_DEPTH = 0.35;
const WORD_STARS = 640;
const WORD_STARS_MOBILE = 360;
const WORD_CENTRE_Y = 0.05;
/* Word stars converge to this size (× brightness) so the letters read crisply. */
const WORD_STAR_SIZE = 2.1;

/* Cursor push spring, in square units (1 = half the viewport height). */
const CURSOR_RADIUS = 0.24;
const CURSOR_PUSH = 7;
const SPEED_GATE = 0.3;
const SPRING_K = 70;
const SPRING_C = 15;
const MAX_DISP = 0.12;
const SLEEP_D = 4e-4;
const SLEEP_V = 2e-3;
const DT_MAX = 1 / 30;
const CURSOR_HOT_MS = 120;

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
 *
 * Star positions live in "square units" (y in ±1, x scaled by the aspect
 * measured at build) so the field can be turned in 3D for the reveal and
 * pushed by the cursor, then projected back to the orthographic camera.
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
  brightness = 1,
  warmStarRatio = 0.15,
  driftSpeed = 0.008,
  progress,
  revealWord,
  revealRange,
  interactive = false,
}: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const scrollRef = useRef(0);
  const revealStart = revealRange?.[0] ?? 0.1;
  const revealEnd = revealRange?.[1] ?? 0.4;

  useEffect(() => {
    if (!progress) return;
    scrollRef.current = progress.get();
    return progress.on("change", (value) => {
      scrollRef.current = value;
    });
  }, [progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let teardown: (() => void) | undefined;
    const wantWord = Boolean(revealWord) && !reduced;
    const fontFamily = resolveFontFamily();
    const fontSpec = `600 200px ${fontFamily}`;

    const build = (): (() => void) | undefined => {
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          powerPreference: "high-performance",
        });
      } catch {
        return undefined;
      }

      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 2;
      const field = new THREE.Group();
      scene.add(field);

      const rect0 = canvas.getBoundingClientRect();
      const aspect = rect0.width > 0 && rect0.height > 0
        ? rect0.width / rect0.height
        : window.innerWidth / Math.max(1, window.innerHeight);

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
        brightness,
        warmStarRatio,
      );
      const positions = data.positions;
      const alphas = data.alphas;
      const sizes = data.sizes;
      const n = starCount;

      /* Per-star field state. */
      const home = new Float32Array(n * 3);
      const homeX = new Float32Array(n);
      const homeY = new Float32Array(n);
      const isWord = new Uint8Array(n);
      const baseAlpha = Float32Array.from(alphas);
      const baseSize = Float32Array.from(sizes);
      const massInv = new Float32Array(n);
      const dispX = new Float32Array(n);
      const dispY = new Float32Array(n);
      const velX = new Float32Array(n);
      const velY = new Float32Array(n);
      const active = new Int32Array(n);
      const inActive = new Uint8Array(n);
      let activeCount = 0;
      let wordCount = 0;

      const restBg = new Float32Array(9);
      rotationXY(REVEAL_TILT_X * BG_WEIGHT, REVEAL_TILT_Y * BG_WEIGHT, restBg);
      for (let i = 0; i < n; i += 1) {
        const o = i * 3;
        mulTransposed(restBg, positions[o] * aspect, positions[o + 1], randomBetween(random, -BG_DEPTH, BG_DEPTH), home, o);
        homeX[i] = positions[o] * aspect;
        homeY[i] = positions[o + 1];
        massInv[i] = 1 / (0.7 + 0.12 * (sizes[i] / Math.max(0.1, brightness)));
      }

      if (wantWord && revealWord) {
        const firstBackground = data.constellations.reduce((total, c) => total + c.indices.length, 0);
        const halfWidth = clamp(0.6 * aspect, 0.4, 1.15);
        const points = sampleWordPoints(
          revealWord,
          fontFamily,
          isMobile ? WORD_STARS_MOBILE : WORD_STARS,
          halfWidth,
          random,
        );
        if (points) {
          const restWord = new Float32Array(9);
          rotationXY(REVEAL_TILT_X, REVEAL_TILT_Y, restWord);
          const pointCount = points.length / 2;
          const limitX = FIELD_OVERSCAN * aspect;
          const limitY = FIELD_OVERSCAN;

          /* Rest-state footprint of the smeared word, so the stars we replace
             already live there and the field's density does not change. */
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          const tmp = new Float32Array(3);
          for (let j = 0; j < pointCount; j += 1) {
            for (const zw of [-WORD_DEPTH, WORD_DEPTH]) {
              mulMatrix(restWord, points[j * 2], points[j * 2 + 1], zw, tmp, 0);
              minX = Math.min(minX, tmp[0]); maxX = Math.max(maxX, tmp[0]);
              minY = Math.min(minY, tmp[1]); maxY = Math.max(maxY, tmp[1]);
            }
          }
          minX = Math.max(minX, -limitX); maxX = Math.min(maxX, limitX);
          minY = Math.max(minY, -limitY); maxY = Math.min(maxY, limitY);

          const eligible: number[] = [];
          for (let i = firstBackground; i < n; i += 1) {
            const x = homeX[i];
            const y = homeY[i];
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) eligible.push(i);
          }
          shuffle(eligible, random);
          wordCount = Math.min(pointCount, eligible.length);

          for (let j = 0; j < wordCount; j += 1) {
            const i = eligible[j];
            const wx = points[j * 2];
            const wy = points[j * 2 + 1];
            let zw = 0;
            for (let attempt = 0; attempt < 20; attempt += 1) {
              zw = randomBetween(random, -WORD_DEPTH, WORD_DEPTH);
              mulMatrix(restWord, wx, wy, zw, tmp, 0);
              if (Math.abs(tmp[0]) <= limitX && Math.abs(tmp[1]) <= limitY) break;
            }
            mulMatrix(restWord, wx, wy, zw, tmp, 0);
            tmp[0] = clamp(tmp[0], -limitX, limitX);
            tmp[1] = clamp(tmp[1], -limitY, limitY);
            const o = i * 3;
            home[o] = wx;
            home[o + 1] = wy;
            home[o + 2] = zw;
            homeX[i] = tmp[0];
            homeY[i] = tmp[1];
            positions[o] = tmp[0] / aspect;
            positions[o + 1] = tmp[1];
            positions[o + 2] = clamp(tmp[2] * 0.02, -0.06, 0.06);
            isWord[i] = 1;
            const colour = STAR_COLOURS[random() < 0.6 ? 0 : 1];
            data.colours[o] = colour.r;
            data.colours[o + 1] = colour.g;
            data.colours[o + 2] = colour.b;
          }
        }
      }

      const starGeometry = new THREE.BufferGeometry();
      const positionAttribute = new THREE.BufferAttribute(positions, 3);
      positionAttribute.setUsage(THREE.DynamicDrawUsage);
      const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
      alphaAttribute.setUsage(THREE.DynamicDrawUsage);
      const sizeAttribute = new THREE.BufferAttribute(sizes, 1);
      sizeAttribute.setUsage(THREE.DynamicDrawUsage);
      starGeometry.setAttribute("position", positionAttribute);
      starGeometry.setAttribute("color", new THREE.BufferAttribute(data.colours, 3));
      starGeometry.setAttribute("aSize", sizeAttribute);
      starGeometry.setAttribute("aAlpha", alphaAttribute);
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

      const segmentCount = data.constellations.reduce((total, c) => total + c.edges.length, 0);
      const linePositions = new Float32Array(segmentCount * 6);
      writeLinePositions(linePositions, positions, data.constellations);
      const lineGeometry = new THREE.BufferGeometry();
      const lineAttribute = new THREE.BufferAttribute(linePositions, 3);
      lineAttribute.setUsage(THREE.DynamicDrawUsage);
      lineGeometry.setAttribute("position", lineAttribute);
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
      let lastElapsed = 0;

      /* Reveal + cursor state. */
      const interactiveOn = interactive && parallax && !reduced;
      let reveal = -1;
      let emphasis = -1;
      const matWord = new Float32Array(9);
      const matBg = new Float32Array(9);
      const cursor = {
        x: 0, y: 0, prevX: 0, prevY: 0, velX: 0, velY: 0,
        t: -Infinity, present: false, hasPrev: false,
      };

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

        const progressValue = (elapsed - shootingStartedAt) / 1.05;
        if (progressValue >= 1) {
          shootingStar.visible = false;
          shootingMaterial.opacity = 0;
          shootingStartedAt = -1;
          nextShootingStar = elapsed + randomBetween(random, 10, 20);
          return;
        }

        const eased = 1 - (1 - progressValue) ** 3;
        const headX = shootingFrom[0] + shootingVector[0] * eased;
        const headY = shootingFrom[1] + shootingVector[1] * eased;
        const tailScale = 0.2 * Math.min(1, progressValue * 6);
        const shootingPositions = shootingGeometry.attributes.position.array as Float32Array;
        shootingPositions[0] = headX - shootingVector[0] * tailScale;
        shootingPositions[1] = headY - shootingVector[1] * tailScale;
        shootingPositions[2] = 0.03;
        shootingPositions[3] = headX;
        shootingPositions[4] = headY;
        shootingPositions[5] = 0.03;
        shootingGeometry.attributes.position.needsUpdate = true;
        shootingMaterial.opacity = 0.42 * Math.sin(Math.PI * progressValue);
      };

      /* Re-project every star's home for the current reveal angle. */
      const rebuildHomes = () => {
        const s = 1 - reveal;
        rotationXY(REVEAL_TILT_X * s, REVEAL_TILT_Y * s, matWord);
        rotationXY(REVEAL_TILT_X * BG_WEIGHT * s, REVEAL_TILT_Y * BG_WEIGHT * s, matBg);
        for (let i = 0; i < n; i += 1) {
          const o = i * 3;
          const m = isWord[i] ? matWord : matBg;
          const bx = home[o];
          const by = home[o + 1];
          const bz = home[o + 2];
          const hx = m[0] * bx + m[1] * by + m[2] * bz;
          const hy = m[3] * bx + m[4] * by + m[5] * bz;
          const hz = m[6] * bx + m[7] * by + m[8] * bz;
          homeX[i] = hx;
          homeY[i] = hy;
          positions[o] = (hx + dispX[i]) / aspect;
          positions[o + 1] = hy + dispY[i];
          positions[o + 2] = clamp(hz * 0.02, -0.06, 0.06);
        }
      };

      const wordStarSize = WORD_STAR_SIZE * Math.max(0.1, brightness);
      const applyEmphasis = () => {
        if (!wordCount) return;
        for (let i = 0; i < n; i += 1) {
          if (!isWord[i]) continue;
          alphas[i] = baseAlpha[i] + (0.95 - baseAlpha[i]) * emphasis;
          sizes[i] = baseSize[i] + (wordStarSize - baseSize[i]) * emphasis;
        }
        alphaAttribute.needsUpdate = true;
        sizeAttribute.needsUpdate = true;
      };

      const activate = (i: number) => {
        if (inActive[i]) return;
        inActive[i] = 1;
        active[activeCount++] = i;
      };

      const proximityPass = (dt: number) => {
        const speed = Math.hypot(cursor.velX, cursor.velY);
        const gate = Math.min(1, speed / SPEED_GATE);
        if (gate <= 0.001) return;
        const cx = cursor.x;
        const cy = cursor.y;
        const radius = CURSOR_RADIUS;
        for (let i = 0; i < n; i += 1) {
          const px = homeX[i] + dispX[i] - cx;
          if (px > radius || px < -radius) continue;
          const py = homeY[i] + dispY[i] - cy;
          if (py > radius || py < -radius) continue;
          const q = Math.hypot(px, py);
          if (q >= radius || q < 1e-5) continue;
          const falloff = (1 - (q / radius) ** 2) ** 2;
          const a = (CURSOR_PUSH * falloff * gate * massInv[i] * dt) / q;
          velX[i] += px * a;
          velY[i] += py * a;
          activate(i);
        }
      };

      const springPass = (dt: number) => {
        let k = 0;
        while (k < activeCount) {
          const i = active[k];
          velX[i] += (-SPRING_K * dispX[i] - SPRING_C * velX[i]) * dt;
          velY[i] += (-SPRING_K * dispY[i] - SPRING_C * velY[i]) * dt;
          let dx = dispX[i] + velX[i] * dt;
          let dy = dispY[i] + velY[i] * dt;
          const d = Math.hypot(dx, dy);
          if (d > MAX_DISP) {
            dx *= MAX_DISP / d;
            dy *= MAX_DISP / d;
          }
          if (d < SLEEP_D && Math.abs(velX[i]) < SLEEP_V && Math.abs(velY[i]) < SLEEP_V) {
            dx = 0;
            dy = 0;
            velX[i] = 0;
            velY[i] = 0;
            inActive[i] = 0;
            active[k] = active[--activeCount];
          } else {
            k += 1;
          }
          dispX[i] = dx;
          dispY[i] = dy;
          const o = i * 3;
          positions[o] = (homeX[i] + dx) / aspect;
          positions[o + 1] = homeY[i] + dy;
        }
      };

      const updateField = (dt: number, now: number) => {
        const p = scrollRef.current;
        const revealTarget = smoothstep(clamp((p - revealStart) / (revealEnd - revealStart), 0, 1));
        const emphasisTarget = emphasisCurve(p);
        let first = false;
        if (reveal < 0) {
          reveal = revealTarget;
          emphasis = emphasisTarget;
          first = true;
        }
        const blend = Math.min(1, dt * 9);
        const prevReveal = reveal;
        const prevEmphasis = emphasis;
        reveal += (revealTarget - reveal) * blend;
        if (Math.abs(revealTarget - reveal) < 1e-4) reveal = revealTarget;
        emphasis += (emphasisTarget - emphasis) * blend;
        if (Math.abs(emphasisTarget - emphasis) < 1e-4) emphasis = emphasisTarget;
        const revealDirty = first || reveal !== prevReveal;
        const emphasisDirty = first || emphasis !== prevEmphasis;

        let hot = false;
        if (interactiveOn && cursor.present) {
          if (cursor.hasPrev && dt > 0) {
            let vx = (cursor.x - cursor.prevX) / dt;
            let vy = (cursor.y - cursor.prevY) / dt;
            const mag = Math.hypot(vx, vy);
            if (mag > 4) {
              vx *= 4 / mag;
              vy *= 4 / mag;
            }
            cursor.velX += (vx - cursor.velX) * 0.5;
            cursor.velY += (vy - cursor.velY) * 0.5;
          }
          cursor.prevX = cursor.x;
          cursor.prevY = cursor.y;
          cursor.hasPrev = true;
          hot = now - cursor.t < CURSOR_HOT_MS;
        } else {
          cursor.velX = 0;
          cursor.velY = 0;
          cursor.hasPrev = false;
        }

        if (emphasisDirty) applyEmphasis();
        if (!(revealDirty || hot || activeCount)) return;
        if (revealDirty) rebuildHomes();
        if (hot) proximityPass(dt);
        if (activeCount) springPass(dt);
        positionAttribute.needsUpdate = true;
        writeLinePositions(linePositions, positions, data.constellations);
        lineAttribute.needsUpdate = true;
      };

      const render = () => {
        const elapsed = clock.getElapsedTime();
        const dt = clamp(elapsed - lastElapsed, 0, DT_MAX);
        lastElapsed = elapsed;
        starMaterial.uniforms.uTime.value = elapsed;
        if (!reduced) {
          pointer.x += (pointer.targetX - pointer.x) * 0.035;
          pointer.y += (pointer.targetY - pointer.y) * 0.035;
          field.position.x = pointer.x + Math.sin(elapsed * driftSpeed) * 0.022;
          field.position.y = pointer.y + Math.cos(elapsed * driftSpeed * 0.73) * 0.014;
          updateShootingStar(elapsed);
          updateField(dt, performance.now());
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(render);
      };

      const start = () => {
        if (raf || !inView || !pageVisible) return;
        clock.start();
        lastElapsed = 0;
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
        if (!interactiveOn) return;
        const rect = canvas.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
        const ny = (event.clientY - rect.top) / Math.max(1, rect.height);
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
          cursor.present = false;
          return;
        }
        cursor.x = (nx * 2 - 1) * aspect - field.position.x * aspect;
        cursor.y = -(ny * 2 - 1) - field.position.y;
        cursor.t = performance.now();
        cursor.present = true;
      };
      const onPointerLeave = () => {
        pointer.targetX = 0;
        pointer.targetY = 0;
        cursor.present = false;
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
    };

    const init = () => {
      if (disposed) return;
      teardown = build();
    };

    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (wantWord && fonts && typeof fonts.check === "function" && !fonts.check(fontSpec)) {
      Promise.race([
        fonts.load(fontSpec).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 700)),
      ]).then(init);
    } else {
      init();
    }

    return () => {
      disposed = true;
      teardown?.();
    };
  }, [
    brightness,
    concentrate,
    constellationCount,
    count,
    driftSpeed,
    intensity,
    interactive,
    mobileCount,
    parallax,
    reduced,
    revealEnd,
    revealStart,
    revealWord,
    seed,
    warmStarRatio,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 block h-full w-full opacity-0 transition-opacity duration-[450ms] ease-out",
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
  brightness: number,
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
    sizes[starIndex] = size * Math.max(0.1, brightness);
    alphas[starIndex] = Math.min(1, alpha * clamp(intensity, 0, 1) * Math.max(0, brightness));
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

function writeLinePositions(
  target: Float32Array,
  positions: Float32Array,
  constellations: ConstellationDefinition[],
) {
  let cursor = 0;
  for (const constellation of constellations) {
    for (const [fromLocal, toLocal] of constellation.edges) {
      const from = constellation.indices[fromLocal] * 3;
      const to = constellation.indices[toLocal] * 3;
      target[cursor++] = positions[from];
      target[cursor++] = positions[from + 1];
      target[cursor++] = 0.02;
      target[cursor++] = positions[to];
      target[cursor++] = positions[to + 1];
      target[cursor++] = 0.02;
    }
  }
}

/**
 * Rasterise `word` and pick up to `n` evenly spread ink pixels, returned as
 * (x, y) pairs in square units centred on the field, `halfWidth` wide.
 */
function sampleWordPoints(
  word: string,
  fontFamily: string,
  n: number,
  halfWidth: number,
  random: () => number,
): Float32Array | null {
  try {
    const W = 1024;
    const H = 320;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    let fontSize = 200;
    ctx.font = `600 ${fontSize}px ${fontFamily}`;
    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0.06em";
    }
    const measured = ctx.measureText(word).width;
    if (measured > W * 0.92) {
      fontSize = Math.floor((fontSize * W * 0.92) / measured);
      ctx.font = `600 ${fontSize}px ${fontFamily}`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(word, W / 2, H / 2);

    const image = ctx.getImageData(0, 0, W, H).data;
    const xs: number[] = [];
    const ys: number[] = [];
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        if (image[(y * W + x) * 4 + 3] > 128) {
          xs.push(x);
          ys.push(y);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (xs.length === 0 || maxX <= minX) return null;

    /* Greedy blue-noise: keep a point only if no kept point is within `cell`. */
    const order = Array.from({ length: xs.length }, (_, i) => i);
    shuffle(order, random);
    const inkArea = xs.length * 4;
    const cell = Math.max(2, Math.sqrt(inkArea / n) * 0.9);
    const minDist2 = (cell * 0.85) ** 2;
    const grid = new Map<number, number[]>();
    const cols = Math.ceil(W / cell);
    const keptX: number[] = [];
    const keptY: number[] = [];
    for (const idx of order) {
      if (keptX.length >= n) break;
      const x = xs[idx];
      const y = ys[idx];
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      let ok = true;
      for (let oy = -1; oy <= 1 && ok; oy += 1) {
        for (let ox = -1; ox <= 1 && ok; ox += 1) {
          const bucket = grid.get((gy + oy) * cols + (gx + ox));
          if (!bucket) continue;
          for (const k of bucket) {
            const ddx = keptX[k] - x;
            const ddy = keptY[k] - y;
            if (ddx * ddx + ddy * ddy < minDist2) {
              ok = false;
              break;
            }
          }
        }
      }
      if (!ok) continue;
      const key = gy * cols + gx;
      const bucket = grid.get(key);
      if (bucket) bucket.push(keptX.length);
      else grid.set(key, [keptX.length]);
      keptX.push(x);
      keptY.push(y);
    }

    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;
    const scale = halfWidth / ((maxX - minX) / 2);
    const out = new Float32Array(keptX.length * 2);
    for (let i = 0; i < keptX.length; i += 1) {
      out[i * 2] = (keptX[i] - centreX) * scale + randomBetween(random, -0.004, 0.004);
      out[i * 2 + 1] = -(keptY[i] - centreY) * scale + WORD_CENTRE_Y + randomBetween(random, -0.004, 0.004);
    }
    return out;
  } catch {
    return null;
  }
}

function resolveFontFamily() {
  if (typeof document === "undefined") return "Inter, system-ui, sans-serif";
  const declared = getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim();
  return declared || "Inter, system-ui, sans-serif";
}

/** Row-major 3×3 rotation Rx(ax) · Ry(ay). */
function rotationXY(ax: number, ay: number, out: Float32Array) {
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  out[0] = cy;
  out[1] = 0;
  out[2] = sy;
  out[3] = sx * sy;
  out[4] = cx;
  out[5] = -sx * cy;
  out[6] = -cx * sy;
  out[7] = sx;
  out[8] = cx * cy;
}

function mulMatrix(m: Float32Array, x: number, y: number, z: number, out: Float32Array, o: number) {
  out[o] = m[0] * x + m[1] * y + m[2] * z;
  out[o + 1] = m[3] * x + m[4] * y + m[5] * z;
  out[o + 2] = m[6] * x + m[7] * y + m[8] * z;
}

/** Multiply by the transpose (the inverse, for a rotation). */
function mulTransposed(m: Float32Array, x: number, y: number, z: number, out: Float32Array, o: number) {
  out[o] = m[0] * x + m[3] * y + m[6] * z;
  out[o + 1] = m[1] * x + m[4] * y + m[7] * z;
  out[o + 2] = m[2] * x + m[5] * y + m[8] * z;
}

/** Word brightness over hero progress: rises with the reveal, relaxes under the card. */
function emphasisCurve(p: number) {
  if (p < 0.12) return 0;
  if (p < 0.4) return smoothstep((p - 0.12) / 0.28);
  if (p < 0.55) return 1;
  if (p < 0.8) return 1 - 0.65 * smoothstep((p - 0.55) / 0.25);
  return 0.35;
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
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

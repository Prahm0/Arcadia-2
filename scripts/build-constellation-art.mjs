// Builds shared/constellationArt.ts: a stylised star figure for each of the
// 88 constellations, drawn from real star positions and brightness.
//
//   node scripts/build-constellation-art.mjs
//
// Source: d3-celestial by Olaf Frohn (BSD-3-Clause), fetched from npm.
import { writeFileSync } from "node:fs";

const BASE = "https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data";
const get = async (file) => (await fetch(`${BASE}/${file}`)).json();
const [lines, stars, names] = await Promise.all([get("constellations.lines.json"), get("stars.6.json"), get("starnames.json")]);
const rad = Math.PI / 180;

// Artwork space matches ConstellationArtwork: a 500×340 stage, stored as percentages.
const W = 500, H = 340, BOX = { left: 64, right: 436, top: 58, bottom: 272 };

const figures = new Map();
for (const feature of lines.features) {
  // Serpens arrives as two features (Head and Tail); it is one constellation.
  const figure = figures.get(feature.id) ?? { stars: [], edges: new Set(), index: new Map() };
  figures.set(feature.id, figure);
  for (const line of feature.geometry.coordinates) {
    let previous = null;
    for (const [ra, dec] of line) {
      const key = `${ra.toFixed(3)},${dec.toFixed(3)}`;
      if (!figure.index.has(key)) { figure.index.set(key, figure.stars.length); figure.stars.push({ ra, dec }); }
      const current = figure.index.get(key);
      if (previous !== null && previous !== current) figure.edges.add([previous, current].sort((a, b) => a - b).join("-"));
      previous = current;
    }
  }
}

function nearestStar({ ra, dec }) {
  let best = null, distance = Infinity;
  for (const star of stars.features) {
    const [sra, sdec] = star.geometry.coordinates;
    let dra = Math.abs(sra - ra); if (dra > 180) dra = 360 - dra;
    const d = Math.hypot(dra * Math.cos(dec * rad), sdec - dec);
    if (d < distance) { distance = d; best = star; }
  }
  return distance < 0.2 ? best : null;
}

const vector = ({ ra, dec }) => [Math.cos(dec * rad) * Math.cos(ra * rad), Math.cos(dec * rad) * Math.sin(ra * rad), Math.sin(dec * rad)];

const out = {};
for (const [abbr, figure] of [...figures].sort(([a], [b]) => a.localeCompare(b))) {
  for (const point of figure.stars) {
    const star = nearestStar(point);
    point.mag = star ? star.properties.mag : 5;
    // Some figures borrow a neighbour's star (Pyxis reaches to Naos). Only a star
    // of this constellation may lead the card.
    point.own = star ? names[star.id]?.c === abbr : false;
  }
  // Stereographic projection about the figure's centre: north up, east to the left, as seen from Earth.
  const sum = figure.stars.map(vector).reduce((a, v) => a.map((n, i) => n + v[i]), [0, 0, 0]);
  const ra0 = Math.atan2(sum[1], sum[0]), dec0 = Math.atan2(sum[2], Math.hypot(sum[0], sum[1]));
  const flat = figure.stars.map(({ ra, dec }) => {
    const a = ra * rad - ra0, d = dec * rad;
    const k = 2 / (1 + Math.sin(dec0) * Math.sin(d) + Math.cos(dec0) * Math.cos(d) * Math.cos(a));
    return [-k * Math.cos(d) * Math.sin(a), -k * (Math.cos(dec0) * Math.sin(d) - Math.sin(dec0) * Math.cos(d) * Math.cos(a))];
  });
  const xs = flat.map((p) => p[0]), ys = flat.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((BOX.right - BOX.left) / Math.max(maxX - minX, 1e-6), (BOX.bottom - BOX.top) / Math.max(maxY - minY, 1e-6));
  const cx = (BOX.left + BOX.right) / 2 - ((minX + maxX) / 2) * scale, cy = (BOX.top + BOX.bottom) / 2 - ((minY + maxY) / 2) * scale;
  const placed = flat.map(([x, y]) => [Math.round(((x * scale + cx) / W) * 1000) / 10, Math.round(((y * scale + cy) / H) * 1000) / 10]);

  // Star 0 is the brightest of the constellation's own stars. The rest light in
  // the order that grows the figure along its lines, brightest neighbour first.
  const edges = [...figure.edges].map((e) => e.split("-").map(Number));
  const byBrightness = figure.stars.map((_, i) => i).sort((a, b) => figure.stars[a].mag - figure.stars[b].mag);
  const order = [byBrightness.find((i) => figure.stars[i].own) ?? byBrightness[0]];
  while (order.length < figure.stars.length) {
    const lit = new Set(order);
    const touching = byBrightness.filter((i) => !lit.has(i) && edges.some(([a, b]) => (a === i && lit.has(b)) || (b === i && lit.has(a))));
    order.push(touching[0] ?? byBrightness.find((i) => !lit.has(i)));
  }
  const position = new Map(order.map((star, i) => [star, i]));
  out[abbr] = {
    points: order.map((i) => placed[i]),
    edges: edges.map(([a, b]) => [position.get(a), position.get(b)].sort((x, y) => x - y)).sort((x, y) => x[0] - y[0] || x[1] - y[1]),
    mags: order.map((i) => Math.round(figure.stars[i].mag * 10) / 10),
    dec: [Math.floor(Math.min(...figure.stars.map((s) => s.dec))), Math.ceil(Math.max(...figure.stars.map((s) => s.dec)))],
  };
}

const body = Object.entries(out).map(([abbr, art]) => `  ${abbr}: { points: ${JSON.stringify(art.points)}, edges: ${JSON.stringify(art.edges)}, mags: ${JSON.stringify(art.mags)}, dec: ${JSON.stringify(art.dec)} },`).join("\n");
writeFileSync(new URL("../shared/constellationArt.ts", import.meta.url), `// Generated by scripts/build-constellation-art.mjs. Do not edit by hand.
//
// Star figures derived from d3-celestial, Copyright (c) 2015, Olaf Frohn.
// All rights reserved. Redistributed under the BSD-3-Clause licence:
// redistributions must retain this notice, the list of conditions and the
// disclaimer at https://github.com/ofrohn/d3-celestial/blob/master/LICENSE.
//
// Points are percentages of the 500×340 artwork stage; star 0 is the brightest.
// dec is the figure's declination range in degrees, south to north.

export interface ConstellationArt { points: [number, number][]; edges: [number, number][]; mags: number[]; dec: [number, number] }

export const CONSTELLATION_ART: Record<string, ConstellationArt> = {
${body}
};
`);
console.log(`Wrote ${Object.keys(out).length} constellations, ${Object.values(out).reduce((n, a) => n + a.points.length, 0)} stars.`);

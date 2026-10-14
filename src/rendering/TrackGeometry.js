import { TRACK, garagePose } from '../config/track.js';

// One arc-length parameterization is deliberately shared by the SVG and WebGL views.
// Circuit dimensions are scenic; segment.length remains the simulation's distance.
const curves = new Map();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function catmull(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return b.map((v, i) => .5 * ((2 * v) + (-a[i] + c[i]) * t +
    (2 * a[i] - 5 * v + 4 * c[i] - d[i]) * t2 +
    (-a[i] + 3 * v - 3 * c[i] + d[i]) * t3));
}

function resolve(segmentOrId) {
  return typeof segmentOrId === 'string' ? TRACK.find((segment) => segment.id === segmentOrId) : segmentOrId;
}

function curveFor(segmentOrId) {
  const segment = resolve(segmentOrId);
  if (!segment?.points?.length) return null;
  if (curves.has(segment)) return curves.get(segment);
  const points = segment.points;
  const samples = [{ position: [...points[0]], distance: 0 }];
  let length = 0;
  // Keep each boundary exactly on its configured point. Station rails remain straight.
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i];
    const c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)];
    for (let j = 1; j <= 32; j++) {
      const position = catmull(a, b, c, d, j / 32);
      length += distance(samples.at(-1).position, position);
      samples.push({ position, distance: length });
    }
  }
  const curve = { segment, samples, length };
  curves.set(segment, curve);
  return curve;
}

export function sampleTrack(segmentOrId, progress = 0) {
  const curve = curveFor(segmentOrId);
  if (!curve || !curve.length) return { position: curve?.samples[0]?.position ?? [0, 5, 0], tangent: [1, 0, 0], bank: 0 };
  const target = clamp(Number.isFinite(progress) ? progress : 0, 0, 1) * curve.length;
  let low = 0, high = curve.samples.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (curve.samples[middle].distance < target) low = middle;
    else high = middle;
  }
  const a = curve.samples[low], b = curve.samples[high];
  const t = (target - a.distance) / Math.max(.0001, b.distance - a.distance);
  const rawTangent = b.position.map((value, i) => value - a.position[i]);
  const magnitude = Math.hypot(...rawTangent) || 1;
  return { position: mix(a.position, b.position, t), tangent: rawTangent.map((value) => value / magnitude), bank: 0 };
}

export function getSegmentSamples(segmentOrId, count = 48) {
  const sampleCount = Math.max(2, Math.floor(Number.isFinite(count) ? count : 48));
  return Array.from({ length: sampleCount }, (_, i) => sampleTrack(segmentOrId, i / (sampleCount - 1)).position);
}

export function getScenicLength(segmentOrId) { return curveFor(segmentOrId)?.length ?? 0; }

export function getTrainPose(train) {
  if(train.state==='INSERTING'){
    const start=garagePose(Math.max(0,Number(train.id.slice(1))-1)),end=sampleTrack('TRANSFER',0),t=clamp(train.garageElapsed/3,0,1);return {...end,position:mix(start.position,end.position,t)};
  }
  if(train.state==='GARAGING'){
    const start=sampleTrack(train.blockId,1),end=garagePose(Math.max(0,Number(train.id.slice(1))-1)),t=clamp(train.garageElapsed/3,0,1);
    return {...end,position:mix(start.position,end.position,t)};
  }
  if (!train.blockId || train.state === 'STORED' || train.state === 'MAINTENANCE') {
    const index = Math.max(0, (Number(String(train.id).replace(/\D/g, '')) || 1) - 1);
    return garagePose(index);
  }
  return sampleTrack(train.blockId, train.progress);
}

// Follow the same track backwards so the ten independent suspended rows bend around turns.
export function sampleBehind(segmentOrId, progress, distanceBehind) {
  let segment = resolve(segmentOrId) ?? TRACK[0];
  let remaining = clamp(progress || 0, 0, 1) * getScenicLength(segment) - Math.max(0, distanceBehind);
  let safety = TRACK.length + 1;
  while (remaining < 0 && safety-- > 0) {
    const index = TRACK.indexOf(segment);
    segment = TRACK[(index + TRACK.length - 1) % TRACK.length];
    remaining += getScenicLength(segment);
  }
  return sampleTrack(segment, remaining / (getScenicLength(segment) || 1));
}

export function getTrackBounds() {
  const points = TRACK.flatMap((segment) => getSegmentSamples(segment));
  return {
    minX: Math.min(...points.map((p) => p[0])), maxX: Math.max(...points.map((p) => p[0])),
    minY: Math.min(...points.map((p) => p[1])), maxY: Math.max(...points.map((p) => p[1])),
    minZ: Math.min(...points.map((p) => p[2])), maxZ: Math.max(...points.map((p) => p[2])),
  };
}

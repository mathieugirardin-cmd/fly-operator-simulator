import { describe, expect, it } from 'vitest';
import { TRACK } from '../config/track.js';
import { getScenicLength, getSegmentSamples, getTrainPose, sampleBehind, sampleTrack } from '../rendering/TrackGeometry.js';

const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const expectPoint = (actual, expected, precision = 7) => {
  for (let axis = 0; axis < 3; axis++) expect(actual[axis]).toBeCloseTo(expected[axis], precision);
};

describe('géométrie commune au circuit SVG et aux trains 3D', () => {
  it('raccorde chaque canton au suivant, y compris le retour en gare', () => {
    for (let index = 0; index < TRACK.length; index++) {
      const segment = TRACK[index];
      const next = TRACK[(index + 1) % TRACK.length];
      expectPoint(sampleTrack(segment.id, 0).position, segment.points[0]);
      expectPoint(sampleTrack(segment.id, 1).position, segment.points.at(-1));
      expectPoint(sampleTrack(segment.id, 1).position, sampleTrack(next.id, 0).position);
    }
  });

  it('produit une tangente normalisée et des positions finies à chaque endroit du parcours', () => {
    for (const segment of TRACK) {
      expect(getScenicLength(segment)).toBeGreaterThan(0);
      for (let tick = 0; tick <= 100; tick++) {
        const pose = sampleTrack(segment.id, tick / 100);
        expect(pose.position.every(Number.isFinite)).toBe(true);
        expect(pose.tangent.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...pose.tangent)).toBeCloseTo(1, 7);
        expectPoint(pose.position, sampleTrack(segment, tick / 100).position);
      }
    }
  });

  it('utilise la distance parcourue pour éviter les bonds entre points de contrôle', () => {
    for (const segment of TRACK) {
      const samples = getSegmentSamples(segment, 201);
      const expectedStep = getScenicLength(segment) / 200;
      for (let index = 1; index < samples.length; index++) {
        const step = distance(samples[index], samples[index - 1]);
        expect(step).toBeLessThanOrEqual(expectedStep * 1.001);
        expect(step).toBeGreaterThan(expectedStep * .65);
      }
    }
  });

  it('fait suivre les rangées arrière sans téléportation à la frontière de deux cantons', () => {
    for (let index = 0; index < TRACK.length; index++) {
      const segment = TRACK[index];
      const next = TRACK[(index + 1) % TRACK.length];
      for (const offset of [0, 2, 12, 24]) {
        expectPoint(sampleBehind(segment, 1, offset).position, sampleBehind(next, 0, offset).position);
      }
      expectPoint(sampleBehind(segment, .5, 0).position, sampleTrack(segment, .5).position);
    }
  });

  it('borne les coordonnées demandées par les vues aux extrémités du canton', () => {
    for (const segment of TRACK) {
      expectPoint(sampleTrack(segment, -1).position, segment.points[0]);
      expectPoint(sampleTrack(segment, 2).position, segment.points.at(-1));
      expectPoint(sampleTrack(segment, NaN).position, segment.points[0]);
    }
  });

  it('place les quatre trains du garage séparément et calcule la même pose depuis leur état logique', () => {
    const garagePositions = Array.from({ length: 4 }, (_, index) => getTrainPose({
      id: `T0${index + 1}`, state: 'STORED', blockId: null, progress: 0,
    }).position);
    expect(new Set(garagePositions.map((position) => position.join(','))).size).toBe(4);
    for (const segment of TRACK) {
      const train = { id: 'T01', state: 'ON_TRACK', blockId: segment.id, progress: .37 };
      expect(getTrainPose(train)).toEqual(sampleTrack(segment.id, .37));
    }
  });
});

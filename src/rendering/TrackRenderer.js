import * as THREE from 'three';
import { TRACK, WORLD_LEVELS } from '../config/track.js';
import { getSegmentSamples, getScenicLength, sampleTrack } from './TrackGeometry.js';
import { box, bar, textSign } from '../scenes/IndustrialScene.js';

export function buildTrack(scene, m) {
  const root = new THREE.Group(); root.name = 'Circuit'; scene.add(root);
  const sleeperGeometry = new THREE.BoxGeometry(.18, .15, 1.55);
  const ties = [];
  for (const segment of TRACK) {
    const count = Math.max(16, Math.ceil(getScenicLength(segment) / 1.5));
    for (const [offset, height, radius, material] of [[-.55, 0, .13, m.rail], [.55, 0, .13, m.rail], [0, .64, .21, m.steel]]) {
      const points = Array.from({ length: count }, (_, i) => {
        const { position: p, tangent: t } = sampleTrack(segment, i / (count - 1));
        const norm = Math.hypot(t[0], t[2]) || 1;
        return new THREE.Vector3(p[0] - t[2] / norm * offset, p[1] + height, p[2] + t[0] / norm * offset);
      });
      const curve = new THREE.CatmullRomCurve3(points);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, count * 2, radius, 6, false), material);
      mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    }
    const tieCount = Math.max(2, Math.ceil(getScenicLength(segment) / 1.5));
    for (let i = 0; i < tieCount; i++) ties.push(sampleTrack(segment, i / tieCount));
    const isStation = segment.type === 'loading' || segment.type === 'unloading';
    if (!isStation) {
      const supportCount = Math.max(2, Math.ceil(getScenicLength(segment) / 11));
      for (let i = 0; i < supportCount; i++) {
        const { position: p, tangent: t } = sampleTrack(segment, (i + .3) / supportCount);
        const norm = Math.hypot(t[0], t[2]) || 1;
        const sx = -t[2] / norm * 2.9, sz = t[0] / norm * 2.9;
        const ground=p[1]<WORLD_LEVELS.exterior+3.5?p[1]-3.6:WORLD_LEVELS.exterior;
        const foot = [p[0] + sx, ground+.25, p[2] + sz], top = [p[0] + sx * .82, p[1] + 1.4, p[2] + sz * .82];
        bar(root, m.steel, foot, top, .22);
        bar(root, m.steel, top, [p[0], p[1] + .68, p[2]], .16);
        box(root, m.concrete, foot[0], ground+.22, foot[2], 1.55, .44, 1.55);
        if (p[1] > 12) bar(root, m.steel, [foot[0] + sx * .6, .2, foot[2] + sz * .6], [top[0], top[1] * .68, top[2]], .14);
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const { position: p } = sampleTrack(segment, i / 5);
        bar(root, m.steel, [p[0], p[1] + .6, p[2]], [p[0], WORLD_LEVELS.stationCeiling-.15, p[2]], .12);
      }
    }
    if (segment.type === 'launch' || segment.type === 'brakes') {
      const plates = Math.ceil(getScenicLength(segment) / 1.2);
      for (let i = 0; i < plates; i++) {
        const pose = sampleTrack(segment, i / plates), p = pose.position, t = pose.tangent;
        const plate = box(root, segment.type === 'launch' ? m.copper : m.red, p[0], p[1] - .22, p[2], .7, .15, .34);
        plate.rotation.y = Math.atan2(-t[2], t[0]);
      }
      if (segment.type === 'launch') {
        const { position: p, tangent: t } = sampleTrack(segment, .5);
        const support = new THREE.Group(); support.position.set(...p); support.rotation.y = Math.atan2(-t[2], t[0]); root.add(support);
        for (const x of [-12, 0, 12]) {
          box(support, m.steel, x, 1, -3, .25, 10, .25);
          box(support, m.steel, x, 1, 3, .25, 10, .25);
          box(support, m.steel, x, 6, 0, .28, .3, 6.5);
          for (const z of [-2, 2]) box(support, m.lamp, x, 5.83, z, .5, .05, .4, false);
        }
        const sign = textSign(support, `LANCEMENT ${segment.id.endsWith('1') ? '01' : '02'}`, 0, 5.2, 2.95, 7.5, .9, { fontScale: .52 });
        sign.rotation.y = 0;
      }
    }
  }
  const sleepers = new THREE.InstancedMesh(sleeperGeometry, m.steel, ties.length);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);
  const forward = new THREE.Vector3(1, 0, 0), tangent = new THREE.Vector3();
  ties.forEach((pose, i) => {
    position.set(pose.position[0], pose.position[1] + .26, pose.position[2]);
    q.setFromUnitVectors(forward, tangent.set(...pose.tangent));
    sleepers.setMatrixAt(i, matrix.compose(position, q, scale));
  });
  sleepers.castShadow = true; sleepers.receiveShadow = true; root.add(sleepers);
  return root;
}

import * as THREE from 'three';
import { box, bar, ball, textSign } from '../scenes/IndustrialScene.js';
import { getTrainPose, sampleBehind } from './TrackGeometry.js';

const forward = new THREE.Vector3(1, 0, 0);
const direction = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const wheelGeometry = new THREE.CylinderGeometry(.23, .23, .17, 10);
wheelGeometry.rotateX(Math.PI / 2);
const harnessCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-.05, .01, -.24), new THREE.Vector3(.43, -.03, -.24),
  new THREE.Vector3(.6, -.47, -.22), new THREE.Vector3(.53, -.83, -.16),
  new THREE.Vector3(.53, -.86, .16), new THREE.Vector3(.6, -.47, .22),
  new THREE.Vector3(.43, -.03, .24), new THREE.Vector3(-.05, .01, .24),
]);
const harnessGeometry = new THREE.TubeGeometry(harnessCurve, 18, .065, 5, false);

function makePassenger(parent, index) {
  const person = new THREE.Group(); parent.add(person);
  const clothes = ['#7b8d80', '#a2987f', '#576e80', '#987164', '#a39b86', '#55625e'];
  const skins = ['#c29b78', '#9a7156', '#d3af91', '#765443'];
  const shirt = new THREE.MeshStandardMaterial({ color: clothes[index % clothes.length], roughness: .98 });
  const skin = new THREE.MeshStandardMaterial({ color: skins[index % skins.length], roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#253030', roughness: .95 });
  box(person, shirt, .015, -.31, 0, .35, .63, .43);
  ball(person, skin, -.015, .18, 0, .19);
  box(person, dark, -.04, .32, 0, .28, .07, .29);
  for (const z of [-.15, .15]) {
    bar(person, shirt, [.03, -.1, z * 1.4], [.3, -.56, z * 1.4], .065);
    bar(person, skin, [.3, -.56, z * 1.4], [.5, -.54, z * 1.4], .047);
    bar(person, dark, [.02, -.72, z], [.47, -.76, z], .105);
    bar(person, dark, [.47, -.76, z], [.51, -1.25, z], .09);
    box(person, dark, .6, -1.28, z, .32, .13, .17);
  }
  return person;
}

export class TrainRenderer {
  constructor(scene, id, materials) {
    this.id = id; this.root = new THREE.Group(); this.root.name = id; scene.add(this.root);
    this.rows = []; this.passengerProgress = [];
    this.rotation = 0; this.harness = 1;
    this.material = new THREE.MeshStandardMaterial({ color: ['#b6a47b', '#937252', '#9c9a84', '#a59169'][(Number(id.slice(-1)) - 1) % 4], metalness: .45, roughness: .6 });
    this.seatMaterial = new THREE.MeshStandardMaterial({ color: '#292f2a', metalness: .08, roughness: .91 });
    for (let i = 0; i < 10; i++) {
      const row = new THREE.Group(); this.root.add(row);
      box(row, materials.dark, 0, .15, 0, 1.5, .24, 1.4);
      box(row, materials.copper, 0, -.03, 0, 1.15, .2, .5);
      for (const x of [-.5, .5]) for (const z of [-.6, .6]) {
        const wheel = new THREE.Mesh(wheelGeometry, materials.dark); wheel.position.set(x, .11, z); row.add(wheel);
      }
      bar(row, materials.steel, [-.42, -.02, 0], [-.26, -1.26, 0], .095);
      bar(row, materials.steel, [.42, -.02, 0], [.26, -1.26, 0], .095);
      box(row, this.material, 0, -.85, 0, .8, .32, .45);
      box(row, materials.copper, 0, -1.22, 0, .45, .18, 1.9);
      const pivot = new THREE.Group(); pivot.position.y = -1.35; row.add(pivot);
      const people = [], harnesses = [];
      for (const side of [-1, 1]) {
        const seat = new THREE.Group(); seat.position.z = side * .55; pivot.add(seat);
        box(seat, this.material, -.34, -.5, 0, .18, 1.25, .81);
        box(seat, this.seatMaterial, -.22, -.51, 0, .15, .98, .58);
        box(seat, this.material, .03, -1.08, 0, .86, .16, .81);
        box(seat, this.seatMaterial, .05, -.97, 0, .65, .12, .61);
        box(seat, this.material, -.35, .16, 0, .23, .24, .57);
        for (const z of [-.34, .34]) bar(seat, materials.steel, [-.15, -.68, z], [.5, -.68, z], .055);
        const harness = new THREE.Group(); harness.position.set(-.31, .07, 0); seat.add(harness);
        const harnessMesh = new THREE.Mesh(harnessGeometry, materials.brass); harnessMesh.castShadow = true; harness.add(harnessMesh);
        box(harness, materials.dark, .56, -.76, 0, .12, .2, .32);
        harnesses.push(harness);
        const person = makePassenger(seat, i * 2 + (side === -1 ? 0 : 1));
        people.push(person); this.passengerProgress.push(0);
      }
      const checkLamp = ball(row, materials.green, .27, -.87, .24, .065);
      this.rows.push({ group: row, pivot, people, harnesses, checkLamp });
    }
    const badge = textSign(this.rows[0].group, id, .7, -.7, .36, .7, .33, { background: '#1b2721', color: '#ebd2a5', fontScale: .59 });
    badge.rotation.y = Math.PI / 2;
  }

  update(train, dt = .016) {
    const alpha = 1 - Math.exp(-Math.min(dt, .1) * 9);
    const pose = getTrainPose(train);
    const isStored = !train.blockId || train.state === 'STORED' || train.state === 'MAINTENANCE';
    this.rotation += ((Number(train.rotation) || 0) - this.rotation) * alpha;
    const harnessTarget = train.harness === 'closed' ? 0 : 1;
    this.harness += (harnessTarget - this.harness) * alpha;
    this.rows.forEach((row, index) => {
      const rowPose = isStored ? { position: pose.position.map((v,axis)=>v-pose.tangent[axis]*index*2.2), tangent: pose.tangent } : sampleBehind(train.blockId, train.progress, index * 2.2);
      row.group.position.set(...rowPose.position);
      direction.set(...rowPose.tangent).normalize();
      rotation.setFromUnitVectors(forward, direction);
      row.group.quaternion.copy(rotation);
      row.pivot.rotation.z = -this.rotation * Math.PI * .5;
      row.harnesses.forEach((harness) => { harness.rotation.z = this.harness * .95; });
      row.checkLamp.visible = Boolean(train.rows?.[index]);
      row.people.forEach((person, sideIndex) => {
        const passengerIndex = index * 2 + sideIndex;
        const target = passengerIndex < (train.passengers || 0) ? 1 : 0;
        this.passengerProgress[passengerIndex] += (target - this.passengerProgress[passengerIndex]) * Math.min(1, dt * 2.5);
        const progress = this.passengerProgress[passengerIndex];
        person.visible = target > 0 || progress > .03;
        // At the platform a newly assigned visitor walks in from the gate and sits.
        const boarding = train.blockId === 'LOAD' && this.harness > .2;
        person.position.z = boarding ? (sideIndex === 0 ? -1 : 1) * (1 - progress) * 1.7 : 0;
        person.position.y = boarding ? (1 - progress) * .55 : 0;
        person.scale.setScalar(.98);
      });
    });
  }
}

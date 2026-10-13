import * as THREE from 'three';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const sphere = new THREE.SphereGeometry(1, 10, 8);
const up = new THREE.Vector3(0, 1, 0);

export function box(parent, material, x, y, z, w, h, d, shadow = true) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
  mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

export function bar(parent, material, a, b, radius = .07) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(cylinder, material), direction = end.clone().sub(start);
  mesh.position.copy(start.add(end).multiplyScalar(.5));
  mesh.scale.set(radius, direction.length(), radius);
  mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  mesh.castShadow = true; parent.add(mesh); return mesh;
}

export function ball(parent, material, x, y, z, r) {
  const mesh = new THREE.Mesh(sphere, material); mesh.position.set(x, y, z); mesh.scale.setScalar(r);
  mesh.castShadow = true; parent.add(mesh); return mesh;
}

function texture(kind) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  let seed = 33;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  if (kind === 'brick') {
    ctx.fillStyle = '#342a24'; ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 16; row++) {
      for (let col = -1; col < 8; col++) {
        const tone = 44 + Math.floor(random() * 28);
        ctx.fillStyle = `rgb(${tone + 24},${tone + 6},${tone - 4})`;
        ctx.fillRect(col * 76 + (row % 2) * 38 + 2, row * 32 + 2, 71, 27);
        ctx.fillStyle = 'rgba(230,190,130,.07)';
        ctx.fillRect(col * 76 + (row % 2) * 38 + 3, row * 32 + 2, 69, 2);
      }
    }
  } else {
    ctx.fillStyle = kind === 'floor' ? '#646760' : '#7c7b6d'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle = `rgba(${random() > .5 ? '255,255,220' : '0,0,0'},${random() * .045})`;
      ctx.fillRect(random() * 512, random() * 512, 1 + random() * 5, 1);
    }
    if (kind === 'floor') {
      ctx.strokeStyle = '#454b47'; ctx.lineWidth = 2;
      for (let i = 0; i <= 512; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke(); }
    }
  }
  const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping; result.repeat.set(kind === 'brick' ? 5 : 4, kind === 'brick' ? 2 : 4);
  result.anisotropy = 8; return result;
}

export function makeMaterials() {
  const m = (color, roughness = .8, metalness = .2) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    steel: m('#3d3430', .55, .75), rail: m('#6e2935', .38, .75), copper: m('#9b6740', .5, .75),
    brass: m('#c5a165', .45, .7), dark: m('#111a19', .75, .25), cream: m('#c5bea2', .95, .05),
    floor: new THREE.MeshStandardMaterial({ color: '#a7aaa3', map: texture('floor'), roughness: .85, metalness: .1 }),
    brick: new THREE.MeshStandardMaterial({ color: '#a39380', map: texture('brick'), roughness: 1 }),
    concrete: m('#55594f', .96, .02), ground: new THREE.MeshStandardMaterial({ color: '#8f8b7c', map: texture('ground'), roughness: 1 }),
    roof: m('#343b35', .8, .4), yellow: m('#e0b458', .65, .25), red: m('#963e32', .6, .4),
    glass: new THREE.MeshStandardMaterial({ color: '#8fa391', roughness: .4, metalness: .1, transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ffdaa0', emissive: '#ffc179', emissiveIntensity: 3 }),
    green: new THREE.MeshStandardMaterial({ color: '#3cd29b', emissive: '#29b77e', emissiveIntensity: .9 }),
    signalRed: new THREE.MeshStandardMaterial({ color: '#d84d3f', emissive: '#ff392b', emissiveIntensity: .9 }),
    white: m('#cccbb9', .7, .1),
  };
}

export function textSign(parent, text, x, y, z, width, height, opts = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = Math.round(1024 * height / width);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = opts.background ?? '#18211e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = opts.color ?? '#ceb580'; ctx.lineWidth = 6; ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  ctx.fillStyle = opts.color ?? '#e1c897'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${opts.bold === false ? '400' : '700'} ${Math.floor(canvas.height * (opts.fontScale ?? .58))}px ${opts.serif ? 'Georgia' : 'Arial'}`;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1, canvas.width - 60);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map, roughness: .8, metalness: .1, emissive: opts.glow ? '#7b674c' : '#000000', emissiveIntensity: .2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}



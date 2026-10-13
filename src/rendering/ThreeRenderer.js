import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STATIONS, GARAGE } from '../config/track.js';
import { stationCamera } from '../scenes/UndergroundStation.js';
import { buildIndustrialScene, makeMaterials } from '../scenes/IndustrialScene.js';
import { buildTrack } from './TrackRenderer.js';
import { TrainRenderer } from './TrainRenderer.js';
import { LockerRoom,lockerCamera,LOCKER_ROOM } from '../scenes/LockerRoom.js';
import {VisitorRooms,VISITOR_ROOMS} from '../scenes/VisitorRooms.js';

export const CAMERAS = [
  { id:'station', label:'Embarquement souterrain', short:'CAM 01', ...stationCamera(STATIONS.loading) },
  { id:'unloading', label:'Débarquement souterrain', short:'CAM 02', ...stationCamera(STATIONS.unloading) },
  { id:'launch1', label:'Premier lancement', short:'CAM 03', position:[72,25,19],target:[7,8,-15],fov:54 },
  { id:'launch2', label:'Second lancement', short:'CAM 04', position:[36,28,47],target:[-9,10,2],fov:54 },
  { id:'garage', label:'Garage fictif', short:'CAM 05',position:[GARAGE.origin[0]+14,GARAGE.origin[1]+3.3,GARAGE.origin[2]-5],target:[GARAGE.origin[0]+12.5,GARAGE.origin[1]-1,GARAGE.origin[2]+12],fov:75 },
  { id:'overview',label:'Rookburgh · niveau extérieur',short:'CAM 06',position:[90,85,112],target:[5,5,-5],fov:50 },
  { id:'lockers',label:'Couloir des casiers',short:'CAM 07',...lockerCamera() },
  { id:'preshow',label:'Salle de préshow',short:'CAM 08',...VISITOR_ROOMS.preshow },
  { id:'security',label:'Contrôle de sécurité',short:'CAM 09',...VISITOR_ROOMS.security },
];
const aliases = { CAM01: 'station', CAM02: 'unloading', CAM03: 'launch1', CAM04: 'launch2', CAM05: 'garage', CAM06: 'overview',CAM07:'lockers' };

export class ThreeRenderer {
  constructor(container, { onError } = {}) {
    this.container = container; this.onError = onError; this.trains = new Map(); this.visualTrains = new Map();
    this.cameraId = 'station'; this.elapsed = 0; this.disposed = false; this.failed = false;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      this.failed = true;
      const fallback = document.createElement('div'); fallback.className = 'webgl-fallback';
      fallback.textContent = "Vue 3D indisponible sur cet appareil. La carte et le pupitre restent opérationnels.";
      container.append(fallback); this.fallback = fallback; onError?.(error); return;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.27;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'scene-canvas';
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none';
    this.renderer.domElement.setAttribute('aria-label', 'Gare industrielle en 3D. Glissez pour orienter la caméra et utilisez la molette pour zoomer.');
    this.renderer.domElement.setAttribute('tabindex', '0'); container.append(this.renderer.domElement);
    this.onContextLost = (event) => { event.preventDefault(); this.failed = true; onError?.(new Error('Le contexte graphique a été perdu. Rechargez la page pour rétablir la vue 3D.')); };
    this.onContextRestored = () => { this.failed = false; };
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#586257');
    this.scene.fog = new THREE.FogExp2('#586257', .0055);
    this.camera = new THREE.PerspectiveCamera(49, 1, .15, 390);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .07;
    this.controls.minDistance = 5; this.controls.maxDistance = 220;
    this.controls.maxPolarAngle = Math.PI * .49; this.controls.enablePan = true;
    this.hemi = new THREE.HemisphereLight('#d8e3ed', '#5c4830', 2.65); this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#eadbc6', .32); this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#ffe0a9', 3.05); this.sun.position.set(-35, 60, 28);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { near: 1, far: 180, left: -80, right: 80, top: 80, bottom: -80 });
    this.sun.shadow.bias = -.0003; this.sun.shadow.normalBias = .12; this.scene.add(this.sun);
    this.fill = new THREE.DirectionalLight('#b6cddd', 1.3); this.fill.position.set(40, 20, -45); this.scene.add(this.fill);
    this.materials = makeMaterials(); this.environment = buildIndustrialScene(this.scene, this.materials);
    this.lockerRoom=new LockerRoom(this.scene,this.materials);
    this.visitorRooms=new VisitorRooms(this.scene,this.materials);
    this.track = buildTrack(this.scene, this.materials);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.setQuality('medium'); this.setCamera('station'); this.resize();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    if (!this.renderer || this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height || 480);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setCamera(id) {
    this.cameraId = aliases[id] ?? id;
    if (!this.camera) return;
    const config = CAMERAS.find((camera) => camera.id === this.cameraId) ?? CAMERAS[0];
    this.cameraId = config.id; this.camera.fov = config.fov;
    this.renderer.domElement.setAttribute('aria-label',`${config.label} en 3D. Glissez pour orienter la caméra et utilisez la molette pour zoomer.`);
    this.activeStation=config.station?STATIONS[config.station]:null;
    const underground=Boolean(this.activeStation)||['garage','lockers','preshow','security'].includes(config.id);
    this.controls.minDistance=underground?3:5;this.controls.maxDistance=underground?33:240;
    this.controls.enablePan=!underground;
    // Apply the new orbit limits before updating: a station limit must not zoom the exterior view in.
    this.camera.position.set(...config.position);this.controls.target.set(...config.target);
    this.controls.update();this.camera.updateProjectionMatrix();
    this.hemi.intensity=underground ? .22 : 2.5;this.ambient.intensity=underground ? .22 : .25;
    this.sun.intensity=underground?0:3.05;this.fill.intensity=underground?0:1.25;
    this.scene.background.set(underground?'#141715':'#94a6ac');
    this.scene.fog.color.copy(this.scene.background);this.scene.fog.density=underground ? .002 : .0015;
    for(const [id,room] of [['station',this.environment.loading],['unloading',this.environment.unloading]])room.lights.forEach(light=>light.visible=config.id===id);
    this.environment.garage.traverse(object=>{if(object.isPointLight)object.visible=config.id==='garage';});
    this.lockerRoom.setVisible(config.id==='lockers');
    this.visitorRooms.show(config.id);
    this.controls.saveState();
  }

  resetCamera() { this.setCamera(this.cameraId); }

  setQuality(quality) {
    this.quality = quality;
    if (!this.renderer) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : quality === 'high' ? 2 : 1.4);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = quality !== 'low';
    const size = quality === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.resize();
  }

  update(state, deltaSeconds = .016) {
    if (this.failed || this.disposed || !this.renderer) return;
    const dt = Math.min(.1, Math.max(0, deltaSeconds)); this.elapsed += dt;
    for (const train of state.trains ?? []) {
      if (!this.trains.has(train.id)) this.trains.set(train.id, new TrainRenderer(this.scene, train.id, this.materials));
      let visual = this.visualTrains.get(train.id);
      if (!visual || visual.blockId !== train.blockId || Math.abs(visual.progress - train.progress) > .2) {
        visual = { ...train }; this.visualTrains.set(train.id, visual);
      } else {
        const progress = visual.progress + ((train.progress || 0) - visual.progress) * (1 - Math.exp(-dt * 15));
        Object.assign(visual, train, { progress });
      }
      this.trains.get(train.id).update(visual, dt);
    }
    const gatesOpen = Boolean(state.station?.gatesOpen);
    for (const gate of this.environment.loading.gates) gate.rotation.y += ((gatesOpen ? -Math.PI * .49 : 0) - gate.rotation.y) * Math.min(1, dt * 4);
    const unloading = (state.trains ?? []).some((train) => train.state === 'UNLOADING');
    for (const gate of this.environment.unloading.gates) gate.rotation.y += ((unloading ? -Math.PI * .49 : 0) - gate.rotation.y) * Math.min(1, dt * 4);
    const stationTrain = (state.trains ?? []).find((train) => train.blockId === 'LOAD');
    const ready = stationTrain?.state === 'READY';
    this.environment.loading.signals.forEach(({ red, green }) => { red.visible = !ready; green.visible = ready; });
    this.environment.unloading.signals.forEach(({ red, green }) => { red.visible = unloading; green.visible = !unloading; });
    this.controls.update();
    if(this.cameraId==='lockers') {
      const [x,,z]=LOCKER_ROOM.origin;
      this.camera.position.x=THREE.MathUtils.clamp(this.camera.position.x,x-7.4,x+7.4);
      this.camera.position.z=THREE.MathUtils.clamp(this.camera.position.z,z-2.7,z+2.7);
      this.camera.position.y=THREE.MathUtils.clamp(this.camera.position.y,LOCKER_ROOM.floor+.8,LOCKER_ROOM.ceiling-.5);
      this.camera.lookAt(this.controls.target);
    }
    if(this.activeStation) {
      const s=this.activeStation,dx=this.camera.position.x-s.center[0],dz=this.camera.position.z-s.center[2];
      const x=THREE.MathUtils.clamp(dx*s.direction[0]+dz*s.direction[2],-s.length/2-2,s.length/2+2);
      const z=THREE.MathUtils.clamp(-dx*s.direction[2]+dz*s.direction[0],-s.width/2+.7,s.width/2-.7);
      this.camera.position.set(s.center[0]+x*s.direction[0]-z*s.direction[2],THREE.MathUtils.clamp(this.camera.position.y,s.floor+1,s.ceiling-.6),s.center[2]+x*s.direction[2]+z*s.direction[0]);
      this.camera.lookAt(this.controls.target);
    }
    this.lockerRoom.update(state,dt,this.materials);
    const visitorRoom=VISITOR_ROOMS[this.cameraId];if(visitorRoom){const [x,y,z]=visitorRoom.origin;this.camera.position.x=THREE.MathUtils.clamp(this.camera.position.x,x-6.9,x+6.9);this.camera.position.y=THREE.MathUtils.clamp(this.camera.position.y,y+1,y+4);this.camera.position.z=THREE.MathUtils.clamp(this.camera.position.z,z-6.9,z+6.9);this.camera.lookAt(this.controls.target);}
    this.visitorRooms.update(state,dt,this.materials);
    this.renderer.render(this.scene, this.camera);
    return { camera: this.cameraId, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  dispose() {
    this.disposed = true; this.resizeObserver?.disconnect(); this.controls?.dispose(); this.fallback?.remove();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.scene?.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
        materials.add(material); if (material.map) textures.add(material.map);
      }
    });
    geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose()); textures.forEach((texture) => texture.dispose());
    this.renderer?.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer?.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer?.dispose(); this.renderer?.domElement.remove();
  }
}

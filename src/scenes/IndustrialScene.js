import * as THREE from 'three';
import { box,bar,textSign } from './ScenePrimitives.js';
import { buildUndergroundStation } from './UndergroundStation.js';
import { TRACK,STATIONS,WORLD_LEVELS,LANDMARKS,GARAGE,garagePose } from '../config/track.js';
import { getSegmentSamples,sampleTrack,getScenicLength } from '../rendering/TrackGeometry.js';
import {FLEET_SIZE} from '../config/operations.js';
export { box,bar,ball,textSign,makeMaterials } from './ScenePrimitives.js';

function ground(parent,m) {
  // Continuous subsoil base closes oblique sight lines through the surface excavations.
  box(parent,m.concrete,0,Math.min(WORLD_LEVELS.returnTunnel,WORLD_LEVELS.stationFloor)-6,0,250,.5,200);
  const surface=new THREE.Shape();surface.moveTo(-125,-100);surface.lineTo(125,-100);surface.lineTo(125,100);surface.lineTo(-125,100);surface.closePath();
  // Two portal trenches cut the level-0 slab: the train never crosses opaque ground.
  // These bounds are derived from the reconstructed ramps, not measured real entrances.
  for(const id of ['DEPART','RETURN']) {
    const ramp=getSegmentSamples(id,180).filter(p=>p[1]>WORLD_LEVELS.exterior-3.7&&p[1]<WORLD_LEVELS.exterior+4.7);
    if(!ramp.length) continue;
    const minX=Math.min(...ramp.map(p=>p[0]))-4.6,maxX=Math.max(...ramp.map(p=>p[0]))+4.6;
    const minZ=Math.min(...ramp.map(p=>p[2]))-4.6,maxZ=Math.max(...ramp.map(p=>p[2]))+4.6;
    const hole=new THREE.Path();hole.moveTo(minX,-minZ);hole.lineTo(minX,-maxZ);hole.lineTo(maxX,-maxZ);hole.lineTo(maxX,-minZ);hole.closePath();surface.holes.push(hole);
    // A dark excavation floor closes the view below each portal; no sky through the terrain.
    box(parent,m.concrete,(minX+maxX)/2,Math.min(WORLD_LEVELS.returnTunnel,WORLD_LEVELS.stationFloor)-6,(minZ+maxZ)/2,maxX-minX+2,.5,maxZ-minZ+2);
  }
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(surface),m.ground);mesh.rotation.x=-Math.PI/2;mesh.position.y=WORLD_LEVELS.exterior;mesh.receiveShadow=true;mesh.castShadow=true;mesh.name='Sol extérieur · niveau 0 avec trémies';parent.add(mesh);
}
function insideStation(p) {
  return Object.values(STATIONS).some(s=>{
    const dx=p[0]-s.center[0],dz=p[2]-s.center[2];
    // Clip the whole tunnel radius at room walls, including parallel service tracks.
    return p[1]-4.6<s.ceiling && p[1]+2.3>s.floor && Math.abs(dx*s.direction[0]+dz*s.direction[2])<s.length/2+3.3 && Math.abs(-dx*s.direction[2]+dz*s.direction[0])<s.width/2+3.5;
  });
}
function tunnels(parent,m) {
  const wall=m.concrete.clone();wall.side=THREE.DoubleSide;wall.color.set('#45463f');
  for(const segment of TRACK.filter(s=>!['loading','unloading'].includes(s.type))) {
    const samples=getSegmentSamples(segment,Math.ceil(getScenicLength(segment)*2));let run=[];
    const flush=()=>{
      if(run.length<2){run=[];return;}
      const curve=new THREE.CatmullRomCurve3(run.map(p=>new THREE.Vector3(p[0],p[1]-1.15,p[2])));
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,run.length),3.45,12,false),wall);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=`Tunnel ${segment.id}`;parent.add(mesh);
      for(let i=0;i<run.length;i+=16) {
        const p=run[i];box(parent,m.lamp,p[0],p[1]+1.9,p[2],.6,.04,.6,false);
      }
      run=[];
    };
    for(const p of samples) {if(p[1]<=WORLD_LEVELS.exterior+4.5&&!insideStation(p))run.push(p);else flush();}flush();
  }
}
function landmark(parent,m,data) {
  const shape=new THREE.Shape();data.polygon.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:data.height,bevelEnabled:false});geometry.rotateX(-Math.PI/2);
  const building=new THREE.Mesh(geometry,m.brick);building.position.y=WORLD_LEVELS.exterior;building.castShadow=true;building.receiveShadow=true;building.name=data.label;parent.add(building);
  const roof=new THREE.Mesh(new THREE.ShapeGeometry(shape),m.copper);roof.rotation.x=-Math.PI/2;roof.position.y=WORLD_LEVELS.exterior+data.height+.12;parent.add(roof);
  const xs=data.polygon.map(p=>p[0]),zs=data.polygon.map(p=>p[1]);
  const cx=xs.reduce((a,b)=>a+b,0)/xs.length,cz=zs.reduce((a,b)=>a+b,0)/zs.length;
  for(const [x,z] of data.polygon) bar(parent,m.steel,[x,.1,z],[x,data.height+.25,z],.13);
  // Riveted upper water tank and pipes echo the supplied exterior reference.
  if(data.id!=='restaurant') {
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(2,2.2,3,14),m.copper);tank.position.set(cx,data.height+1.7,cz);parent.add(tank);
    for(const dx of [-1.2,1.2]) bar(parent,m.steel,[cx+dx,data.height,cz],[cx+dx,data.height+1,cz],.1);
  }
  const sign=textSign(parent,data.label.toUpperCase(),cx,data.height+.8,cz,9,1.05,{fontScale:.48});sign.rotation.x=-Math.PI/2;
}
function garage(parent,m) {
  const origin=GARAGE.origin,width=(FLEET_SIZE-1)*GARAGE.spacing+8,center=[origin[0]+(FLEET_SIZE-1)*GARAGE.spacing/2,origin[1],origin[2]+9];
  const root=new THREE.Group();root.name='Garage souterrain fictif';parent.add(root);
  const floor=WORLD_LEVELS.stationFloor,ceiling=WORLD_LEVELS.stationCeiling;
  box(root,m.floor,center[0],floor-.2,center[2],width,.4,34);
  box(root,m.roof,center[0],ceiling+.2,center[2],width,.4,34);
  for(const x of [center[0]-width/2,center[0]+width/2])box(root,m.brick,x,(floor+ceiling)/2,center[2],.5,ceiling-floor,34);
  box(root,m.brick,center[0],(floor+ceiling)/2,center[2]+17,width,ceiling-floor,.5);
  for(let i=0;i<FLEET_SIZE;i++) {
    const p=garagePose(i).position;
    for(const offset of [-.55,.55]) bar(root,m.rail,[p[0]+offset,p[1],p[2]-3],[p[0]+offset,p[1],p[2]+24],.13);
    for(let z=p[2]-3;z<p[2]+24;z+=2) box(root,m.steel,p[0],p[1]+.2,z,1.5,.1,.13);
    box(root,m.lamp,p[0],ceiling-.2,p[2]+10,1,.06,4,false);
    const light=new THREE.PointLight('#ffd4a0',140,22,2);light.position.set(p[0],ceiling-.65,p[2]+9);root.add(light);
  }
  textSign(root,'ATELIERS · IMPLANTATION FICTIVE',center[0],ceiling-1,center[2]+16.7,19,1,{fontScale:.48}).rotation.y=Math.PI;
  return root;
}
export function buildIndustrialScene(scene,m) {
  const group=new THREE.Group();group.name='Rookburgh · plusieurs niveaux';scene.add(group);
  ground(group,m);tunnels(group,m);
  const loading=buildUndergroundStation(group,m,STATIONS.loading),unloading=buildUndergroundStation(group,m,STATIONS.unloading);
  const workshops=garage(group,m);
  LANDMARKS.forEach(data=>landmark(group,m,data));
  // Surface machinery is placed away from the two underground halls.
  for(const [x,z] of [[-8,-10],[21,26],[-48,25]]) {
    const tank=new THREE.Mesh(new THREE.SphereGeometry(2.7,14,12),m.cream);tank.scale.y=1.35;tank.position.set(x,5,z);tank.castShadow=true;group.add(tank);
    for(const dx of [-1.7,1.7]) for(const dz of [-1.7,1.7])bar(group,m.steel,[x+dx,0,z+dz],[x+dx,4,z+dz],.13);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(2.72,.055,6,24),m.steel);ring.position.set(x,5,z);ring.rotation.x=Math.PI/2;group.add(ring);
  }
  return {group,loading,unloading,garage:workshops};
}

import * as THREE from 'three';
import { box, bar, ball, textSign } from './ScenePrimitives.js';
import { stationLocalToWorld } from '../config/track.js';

export function createStationShell(config, m) {
  const group=new THREE.Group(); group.name=`Gare fermée ${config.id}`;
  group.position.set(config.center[0],0,config.center[2]);
  group.rotation.y=-Math.atan2(config.direction[2],config.direction[0]);
  const half=config.length/2+3, width=config.width, f=config.floor, roof=config.ceiling, height=roof-f;
  const walls=[];
  const part=(name,mat,...args)=>{const object=box(group,mat,...args);object.name=name;return object;};
  part('Dalle de fond',m.concrete,0,f-.65,0,half*2,.5,width);
  part('Quai côté contrôle',m.floor,0,f-.15,4,half*2,.3,5);
  part('Quai côté sortie',m.floor,0,f-.15,-4,half*2,.3,5);
  for(const z of [-width/2,width/2]) walls.push(part(z<0?'Mur arrière':'Mur avant',m.brick,0,(f+roof)/2,z,half*2,height,.5));
  // End walls remain solid except for one 4.4 m rail portal at each end.
  const portalBottom=f-.4,portalTop=config.rail+2.2;
  for(const x of [-half,half]) {
    for(const sign of [-1,1]) walls.push(part(`Mur extrémité ${x<0?'entrée':'sortie'} ${sign}`,m.brick,x,(f+roof)/2,sign*(width/4+1.1),.55,height,width/2-2.2));
    walls.push(part(`Linteau ${x<0?'entrée':'sortie'}`,m.concrete,x,(roof+portalTop)/2,0,.6,roof-portalTop,4.4));
    for(const z of [-2.28,2.28]) part('Encadrement portail',m.steel,x,(portalBottom+portalTop)/2,z,.8,portalTop-portalBottom,.18);
    part('Traverse portail',m.steel,x,portalTop,0,.8,.18,4.7);
  }
  const ceiling=part('Plafond opaque',m.roof,0,roof+.22,0,half*2+.5,.44,width+.5);
  group.userData={closed:true,config,portalTop,portalBottom};
  return {group,walls,ceiling,half};
}

export function buildUndergroundStation(parent,m,config) {
  const result=createStationShell(config,m),{group,half}=result; parent.add(group);
  const f=config.floor, r=config.rail,c=config.ceiling, gates=[],signals=[], lights=[];
  for(let x=-half+2;x<half;x+=6) {
    for(const z of [-6.15,6.15]) {
      box(group,m.steel,x,(c+f)/2,z,.27,c-f,.3);
      box(group,m.copper,x,f+1,z,.5,2,.09);
      bar(group,m.steel,[x,c-1.5,z],[x,c-.25,z>0?4:-4],.09);
    }
    box(group,m.steel,x,c-.22,0,.25,.35,12.5);
    for(let z=-5.7;z<5.7;z+=2) bar(group,m.steel,[x,c-.7,z],[x,c-.2,z+1],.055);
    box(group,m.dark,x,c-.6,3.8,1.55,.19,.65);
    box(group,m.lamp,x,c-.71,3.8,1.35,.04,.45,false);
    const light=new THREE.PointLight('#ffd59b',145,15,2);light.position.set(x,c-1.05,3.8);group.add(light);lights.push(light);
    box(group,m.dark,x,c-.6,-3.8,1.4,.19,.65);
    box(group,m.lamp,x,c-.71,-3.8,1.2,.04,.45,false);
  }
  // Fill from platform fittings, deliberately artificial and warm.
  const fill=new THREE.PointLight('#eacdac',110,28,2);fill.position.set(0,r+.5,-3);group.add(fill);lights.push(fill);
  for(const z of [-5.92,-5.55]) {
    bar(group,m.copper,[-half+.5,r+.2,z],[half-.5,r+.2,z],.09);
    bar(group,m.copper,[half-2,f+.3,z],[half-2,c-.9,z],.1);
  }
  for(let x=-half+1;x<half;x+=1) for(const z of [-1.38,1.38]) box(group,m.yellow,x,f+.014,z,.5,.025,.11,false);
  for(let i=0;i<10;i++) {
    const x=config.length/2-i*2.2;
    const pivot=new THREE.Group();pivot.position.set(x-.82,f,1.65);group.add(pivot);
    for(const y of [.2,1.15]) box(pivot,m.copper,.85,y,0,1.7,.06,.06);
    for(let j=0;j<6;j++) box(pivot,m.steel,.12+j*.28,.66,0,.04,.96,.04);
    gates.push(pivot);
    box(group,m.steel,x-.87,f+.63,1.65,.085,1.26,.085);
    const number=textSign(group,String(i+1).padStart(2,'0'),x,f+.02,3.5,.75,.5,{background:'#45483d',color:'#e5c78f'});number.rotation.x=-Math.PI/2;
    box(group,m.copper,x-1.07,f+.02,3.8,.035,.025,3.9,false);
  }
  const label=config.id==='loading'?'F.L.Y.':'DÉBARQUEMENT';
  textSign(group,label,0,r+.6,-6.23,10,1.85,{serif:true,fontScale:config.id==='loading'?.75:.43,glow:true});
  textSign(group,'ROOKBURGH · TERMINAL SOUTERRAIN',0,r-.8,-6.23,10,.55,{fontScale:.48});
  textSign(group,`QUAI ${config.id==='loading'?'01 · EMBARQUEMENT':'02 · SORTIE'}`,0,c-.6,-6.21,8,.55,{fontScale:.49});
  // Door is a closed wall detail; no daylight or exterior opening behind the camera.
  box(group,m.dark,-half+5,f+1.5,-6.2,2.4,3,.14);
  for(const x of [-half+4.4,-half+5.6]) box(group,m.copper,x,f+1.5,-6.1,1.12,2.85,.08);
  textSign(group,'ACCÈS PERSONNEL',-half+5,f+3.3,-6.05,2.9,.4,{fontScale:.45});
  box(group,m.steel,half-5,f+.8,-4.2,3.2,1.6,1.6);
  box(group,m.copper,half-5,f+1.64,-4.2,3.3,.1,1.65);
  box(group,m.dark,half-5,f+2.03,-4.7,1.4,.7,.13);
  box(group,m.green,half-5,f+2.04,-4.61,1.16,.45,.02,false);
  for(const x of [-half+1.3,half-1.3]) {
    bar(group,m.steel,[x,f,-1.7],[x,r+.1,-1.7],.08);
    box(group,m.dark,x,r,-1.7,.5,.95,.32);
    const red=ball(group,m.signalRed,x,r+.23,-1.5,.13),green=ball(group,m.green,x,r-.23,-1.5,.13);signals.push({red,green});
  }
  const tunnelSign=textSign(group,'ZONE TECHNIQUE · CIRCUIT',-half+.35,r+1.8,0,3.9,.5,{fontScale:.4});tunnelSign.rotation.y=Math.PI/2;
  return {...result,gates,signals,lights};
}

export function stationCamera(config) {
  return {position:stationLocalToWorld(config,config.length/2+1,config.rail+2.3,5.35),target:stationLocalToWorld(config,-config.length*.18,config.rail-1.2,0),fov:59,station:config.id};
}

import * as THREE from 'three';
import {box,bar,ball,textSign} from './ScenePrimitives.js';
import {LOCKER_CONFIG} from '../config/operations.js';
import {WORLD_LEVELS} from '../config/track.js';

export const LOCKER_ROOM={origin:[8,0,78],floor:WORLD_LEVELS.stationFloor,ceiling:WORLD_LEVELS.stationFloor+4.3};
export const lockerCamera=()=>({position:[15.1,LOCKER_ROOM.floor+2,78],target:[3.5,LOCKER_ROOM.floor+1.65,78],fov:66});
function numberAtlas() {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#855532';ctx.fillRect(0,0,1024,1024);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 40px Georgia';ctx.fillStyle='#e9c392';
  for(let i=0;i<120;i++)ctx.fillText(String(i+1).padStart(3,'0'),(i%12+.5)*1024/12,(Math.floor(i/12)+.5)*1024/10);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map,roughness:.85});
}
export class LockerRoom {
  constructor(scene,m) {
    this.group=new THREE.Group();this.group.name='Couloir des casiers · implantation fictive';this.group.position.set(...LOCKER_ROOM.origin);scene.add(this.group);
    this.doors=[];this.lights=[];this.leds=[];this.visitors=[];
    const g=this.group,f=LOCKER_ROOM.floor,c=LOCKER_ROOM.ceiling;
    box(g,m.floor,0,f-.2,0,16,.4,7.4);box(g,m.roof,0,c+.15,0,16,.3,7.4);
    for(const z of [-3.7,3.7])box(g,m.brick,0,(f+c)/2,z,16,c-f,.4);
    for(const x of [-8,8])box(g,m.brick,x,(f+c)/2,0,.4,c-f,7.4);
    for(let x=-7;x<8;x+=3.5) {
      box(g,m.steel,x,c-.18,0,.15,.2,7.1);
      for(const z of [-3.4,3.4])bar(g,m.steel,[x,f,z],[x,c,z],.08);
      box(g,m.dark,x,c-.32,0,1,.15,.5);box(g,m.lamp,x,c-.42,0,.88,.035,.38,false);
      const light=new THREE.PointLight('#ffd6aa',90,12,2);light.position.set(x,c-.6,0);g.add(light);this.lights.push(light);
    }
    for(const z of [-2.8,2.8])bar(g,m.copper,[-7.9,c-.55,z],[7.9,c-.55,z],.07);
    const atlas=numberAtlas();
    for(let i=0;i<LOCKER_CONFIG.count;i++) {
      const bank=Math.floor(i/60),j=i%60,col=j%12,row=Math.floor(j/12);
      const bankRoot=new THREE.Group();bankRoot.position.set(0,0,bank===0?-3.15:3.15);bankRoot.rotation.y=bank===0?0:Math.PI;g.add(bankRoot);
      const x=-5.6+col*1.01,y=f+.4+row*.56;
      box(bankRoot,m.dark,x,y,-.12,.99,.55,.55);
      const door=new THREE.Group();door.position.set(x-.47,y,.18);bankRoot.add(door);this.doors.push(door);
      box(door,m.copper,.47,0,0,.93,.52,.045);
      box(door,m.brass,.47,.2,.035,.86,.025,.025);
      box(door,m.brass,.47,-.2,.035,.86,.025,.025);
      for(const yy of [-.16,.16])box(door,m.steel,.02,yy,0,.05,.09,.08);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.047,.011,6,12),m.brass);ring.position.set(.79,-.08,.045);door.add(ring);
      const led=ball(door,m.green,.82,.13,.048,.027);this.leds.push(led);
      for(const xx of [.33,.4,.47,.54,.61])ball(door,m.dark,xx,-.15,.027,.012);
      const geom=new THREE.PlaneGeometry(.27,.17),uv=geom.attributes.uv;
      for(let k=0;k<uv.count;k++)uv.setXY(k,(i%12+uv.getX(k))/12,1-(Math.floor(i/12)+1-uv.getY(k))/10);
      const number=new THREE.Mesh(geom,atlas);number.position.set(.47,.055,.032);door.add(number);
      const person=new THREE.Group();person.visible=false;g.add(person);
      box(person,m.steel,0,.85,0,.32,.55,.22);ball(person,m.cream,0,1.28,0,.14);
      for(const dx of [-.1,.1])bar(person,m.dark,[dx,.17,0],[dx,.64,0],.06);
      for(const dx of [-.23,.23])bar(person,m.copper,[dx,.88,0],[dx,.69,.18],.045);
      box(person,m.dark,.21,.55,.15,.19,.25,.15);
      person.position.set(bank===0?x:-x,f,bank===0?-2.25:2.25);person.rotation.y=bank===0?Math.PI:0;
      this.visitors.push(person);
    }
    textSign(g,'CASIERS · CONSIGNE DES VOYAGEURS',0,c-.65,-3.45,10,.7,{fontScale:.42,glow:true});
    box(g,m.steel,-7.74,f+1.15,0,.07,2.3,1.4);
    const exit=textSign(g,'SORTIE / GARE',-7.69,f+2.6,0,2.4,.4,{fontScale:.44});exit.rotation.y=Math.PI/2;
  }
  setVisible(value){this.group.visible=value;this.lights.forEach(l=>l.visible=value);}
  update(state,dt,materials) {
    if(!this.group.visible)return;
    state.lockers.items.forEach((locker,i)=>{
      const door=this.doors[i];door.rotation.y+=((locker.doorOpen?-Math.PI*.42:0)-door.rotation.y)*Math.min(1,dt*6);
      this.leds[i].material=locker.indicatorState==='green'?materials.green:locker.indicatorState==='amber'?materials.lamp:materials.signalRed;
      this.leds[i].visible=!locker.fault||Math.floor(state.time*3)%2===0;
      const person=this.visitors[i];person.visible=['RESERVED','DEPOSIT','RETRIEVAL'].includes(locker.phase);
      const bank=Math.floor(i/60),row=Math.floor((i%60)/12),busy=locker.phase!=='RESERVED',lane=2.23-row*.38;
      person.position.z=(bank===0?-1:1)*(busy?lane:lane-.6+Math.min(1,locker.elapsed/.4)*.6);
      person.rotation.x=busy&&!locker.fault&&!state.emergency?Math.sin(locker.elapsed*3)*.08:0;
    });
  }
}

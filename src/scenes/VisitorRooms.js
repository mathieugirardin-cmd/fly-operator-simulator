import * as THREE from 'three';
import {box,ball,textSign} from './ScenePrimitives.js';
export const VISITOR_ROOMS={preshow:{origin:[200,-10.6,100],position:[200,-7.3,106.2],target:[200,-8.6,96.3],fov:68},security:{origin:[225,-10.6,100],position:[225,-7.3,106.2],target:[225,-9,97],fov:68}};
export class VisitorRooms {
  constructor(scene,m) {
    this.rooms={};
    for(const [id,config]of Object.entries(VISITOR_ROOMS)) {
      const group=new THREE.Group();group.position.set(...config.origin);scene.add(group);group.visible=false;
      box(group,m.floor,0,-.15,0,15,.3,15);box(group,m.roof,0,4.6,0,15,.25,15);
      box(group,m.brick,0,2.3,-7.4,9.3,4.6,.3);for(const x of [-7.2,7.2])box(group,m.brick,x,2.3,-7.4,.5,4.6,.3);for(const x of [-5.8,5.8]){box(group,m.brick,x,3.65,-7.4,2.3,1.9,.3);box(group,m.dark,x,1.4,-8,2.3,2.8,.15);}box(group,m.brick,-7.4,2.3,0,.3,4.6,15);box(group,m.brick,7.4,2.3,0,.3,4.6,15);box(group,m.brick,0,2.3,7.4,15,4.6,.3);
      for(const z of [-5,0,5]){box(group,m.steel,0,4.25,z,15,.22,.25);box(group,m.lamp,0,4.1,z,3,.1,.35);const light=new THREE.PointLight('#ffdda8',38,16,1.5);light.position.set(0,3.8,z);group.add(light);}
      const entry=box(group,m.copper,-5.8,1.35,-7.1,2.3,2.7,.2),exit=box(group,m.copper,5.8,1.35,-7.1,2.3,2.7,.2);
      textSign(group,id==='preshow'?'F.L.Y. · BRIEFING DES VOYAGEURS':'CONTRÔLE AVANT EMBARQUEMENT',0,3.8,-7.15,9,.55);
      textSign(group,'ENTRÉE',-5.8,3,-7,2,.4);textSign(group,id==='preshow'?'VERS LES CASIERS':'VERS LE TRAIN',5.8,3,-7,2,.4);
      const people=[];for(let i=0;i<80;i++){const p=new THREE.Group();box(p,m.dark,0,.8,0,.38,.65,.3);ball(p,m.cream,0,1.32,0,.19);box(p,m.steel,-.12,.29,0,.13,.55,.15);box(p,m.steel,.12,.29,0,.13,.55,.15);group.add(p);p.visible=false;people.push(p);}
      let screen=null,scan=[];
      if(id==='preshow') {
        screen=box(group,new THREE.MeshStandardMaterial({color:'#83c4bd',emissive:'#356b75',emissiveIntensity:.4}),0,2.25,-7.05,7,2.1,.1);
        textSign(group,'PRÉPAREZ-VOUS À PRENDRE VOTRE ENVOL',0,2.4,-6.94,6.6,.5,{background:'#1e4141',color:'#e0d4ad'});
        textSign(group,'Après la présentation : casiers puis contrôle de sécurité',0,1.65,-6.94,6.6,.35,{background:'#1e4141',color:'#e0d4ad',fontScale:.45});
      } else {
        for(let i=0;i<2;i++){const x=i?3:-3;box(group,m.steel,x-1,1.4,-2,.2,2.8,.6);box(group,m.steel,x+1,1.4,-2,.2,2.8,.6);box(group,m.copper,x,2.75,-2,2.2,.18,.6);textSign(group,`SEC-0${i+1}`,x,3.1,-2,2,.4);box(group,m.dark,x+1.55,.7,-1.4,.8,1.4,.8);const lamp=box(group,m.green,x,2.6,-1.65,.6,.08,.06);scan.push(lamp);}
      }
      this.rooms[id]={group,entry,exit,people,screen,scan};
    }
  }
  show(id){for(const [key,r]of Object.entries(this.rooms))r.group.visible=key===id;}
  update(s,dt,m) {
    for(const [id,r]of Object.entries(this.rooms)) {
      if(!r.group.visible)continue;
      const show=s.flow.preshow,ids=id==='preshow'?show.batch:s.flow.order.filter(id=>s.flow.people.some(p=>p.id===id&&p.stage==='security')).slice(0,80);
      r.entry.position.x+=((-5.8+(['OPENING','FILLING','FULL'].includes(show.state)?1.8:0))-r.entry.position.x)*Math.min(1,dt*3);
      r.exit.position.x+=((5.8+(show.state==='EXITING'?1.8:0))-r.exit.position.x)*Math.min(1,dt*3);
      r.people.forEach((p,i)=>{p.visible=i<ids.length;if(!p.visible)return;let x=(i%10-4.5)*.65,z=-3+Math.floor(i/10)*.7;if(id==='security'){const post=s.flow.security.stations.findIndex(p=>p.visitorId===ids[i]);x=post>=0?(post?3:-3):(i%2?3:-3);z=post>=0?-2:.2+Math.floor(i/2)*.48;if(z>6.5)p.visible=false;}if(p.userData.id!==ids[i]){p.position.set(-5.8,0,5.5);p.userData.id=ids[i];}const a=s.emergency?0:Math.min(1,dt*2.5);p.position.x+=(x-p.position.x)*a;p.position.z+=(z-p.position.z)*a;p.rotation.y=id==='preshow'?Math.PI:0;});
      if(r.screen)r.screen.material.emissiveIntensity=show.state==='PLAYING'?.8+Math.sin(s.time*2)*.25:.15;
      r.scan.forEach((lamp,i)=>{const post=s.flow.security.stations[i],person=s.flow.people.find(p=>p.id===post.visitorId);lamp.material=!post.open||person?.inventory.some(n=>s.flow.security.rules[n])&&post.inspected?m.signalRed:m.green;});
    }
  }
}

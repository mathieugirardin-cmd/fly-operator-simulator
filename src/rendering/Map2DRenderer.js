import { TRACK, STATIONS, LANDMARKS, GARAGE, garagePose, WORLD_LEVELS } from '../config/track.js';
import { getSegmentSamples, getTrainPose } from './TrackGeometry.js';
import {FLEET_SIZE} from '../config/operations.js';
const NS='http://www.w3.org/2000/svg';let serial=0;
function el(tag,attrs={},text) {const node=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;}
const pathData=s=>getSegmentSamples(s,Math.max(32,s.points.length*12)).map((p,i)=>`${i?'L':'M'}${p[0].toFixed(2)} ${p[2].toFixed(2)}`).join(' ');
export class Map2DRenderer {
  constructor(container,{onSelectTrain,onSelectBlock}={}) {
    this.container=container;this.onSelectTrain=onSelectTrain;this.onSelectBlock=onSelectBlock;this.blocks=new Map();this.trains=new Map();this.mode='plan';
    const id=`plan-${++serial}`;
    this.svg=el('svg',{viewBox:'-83 -62 213 119',role:'group','aria-label':'Circuit reconstruit depuis le plan fourni : deux gares souterraines à droite. Les cantons sont fictifs.',class:'circuit-map'});
    const defs=el('defs'),pattern=el('pattern',{id,width:10,height:10,patternUnits:'userSpaceOnUse'});
    pattern.append(el('path',{d:'M10 0H0V10',fill:'none',stroke:'#7f9384','stroke-width':.12,opacity:.22}));defs.append(pattern);this.svg.append(defs,el('rect',{x:-83,y:-62,width:195,height:119,fill:`url(#${id})`}));
    for(const building of LANDMARKS) {
      this.svg.append(el('polygon',{points:building.polygon.map(p=>p.join(',')).join(' '),fill:building.id==='restaurant'?'#634735':'#2c503b',stroke:building.id==='restaurant'?'#bd895f':'#6c9471','stroke-width':.45,opacity:.8}));
      const x=building.polygon.reduce((sum,p)=>sum+p[0],0)/building.polygon.length,z=building.polygon.reduce((sum,p)=>sum+p[1],0)/building.polygon.length;
      this.svg.append(el('text',{x,y:z,'text-anchor':'middle','dominant-baseline':'middle',fill:'#c7ceb3','font-size':3.2,'font-family':'monospace'},building.label));
    }
    for(const station of Object.values(STATIONS)) {
      const xs=[station.start[0],station.end[0]],zs=[station.start[2],station.end[2]];
      this.svg.append(el('rect',{x:Math.min(...xs)-3,y:Math.min(...zs)-3,width:Math.abs(xs[1]-xs[0])+6,height:Math.abs(zs[1]-zs[0])+6,fill:'#315562',opacity:.42,stroke:'#70c6dc','stroke-width':.45,'stroke-dasharray':'1 1'}));
      const label=station.id==='loading'?'EMB.':'DÉBARQ.';
      this.svg.append(el('text',{x:station.center[0]+(station.id==='loading'?5:0),y:station.center[2]+(station.id==='loading'?0:-5),'text-anchor':station.id==='loading'?'start':'middle',fill:'#96d6e2','font-size':3.2,'font-family':'monospace'},`${label} ${station.rail} m`));
    }
    for(let i=0;i<FLEET_SIZE;i++){const p=garagePose(i).position;this.svg.append(el('path',{d:`M${p[0]} ${p[2]-3}v26`,stroke:'#667563','stroke-width':.5,'stroke-dasharray':'1 1'}));}
    this.svg.append(el('text',{x:GARAGE.origin[0]+7,y:54,fill:'#8d9a83','font-size':2.6,'font-family':'monospace','text-anchor':'middle'},'GARAGE FICTIF'));
    for(const segment of TRACK) {
      const group=el('g',{tabindex:0,role:'button','data-block-id':segment.id}),d=pathData(segment);
      group.style.cursor='pointer';
      const casing=el('path',{d,fill:'none',stroke:'#0c1713','stroke-width':2.8,'stroke-linecap':'round'});
      const glow=el('path',{d,fill:'none',stroke:'#a6efc6','stroke-width':3.2,opacity:0,'pointer-events':'none'});
      const hit=el('path',{d,fill:'none',stroke:'transparent','stroke-width':5});
      const line=el('path',{d,fill:'none',stroke:segment.mapColor,'stroke-width':1.3,'stroke-linecap':'round','pointer-events':'none'});
      const title=el('title',{},segment.name);group.append(title,casing,glow,hit,line);this.svg.append(group);
      const overlay=segment.mapOverlay?el('path',{d:pathData(segment.mapOverlay),fill:'none',stroke:segment.mapOverlay.color,'stroke-width':1.5,'pointer-events':'none'}):null;
      if(overlay)group.append(overlay);
      const select=()=>this.onSelectBlock?.(segment.id);group.addEventListener('click',select);group.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select();}});
      this.blocks.set(segment.id,{group,line,glow,title,segment,overlay});
    }
    this.svg.append(el('text',{x:-77,y:52,fill:'#8d9a83','font-size':2.6,'font-family':'monospace'},'PLAN FOURNI · HAUTEURS HYPOTHÉTIQUES'));
    this.markers=el('g',{'class':'map-trains'});this.svg.append(this.markers);container.append(this.svg);
  }
  setMode(mode) {this.mode=mode==='blocks'?'blocks':'plan';if(this.state)this.update(this.state);}
  setSelectedTrain(id) {this.selectedTrainId=id;}
  createTrain(train) {
    const group=el('g',{tabindex:0,role:'button','data-train-id':train.id});group.style.cursor='pointer';
    const title=el('title'),ring=el('circle',{r:2.8,fill:'none',stroke:'#f0d28c','stroke-width':.6,opacity:0});
    const dot=el('circle',{r:1.5,fill:'#b4ebc6',stroke:'#0d2015','stroke-width':.5});
    const badge=el('rect',{x:2.5,y:-2.2,width:9.4,height:4.4,rx:.6,fill:'#152c21',stroke:'#8eaf91','stroke-width':.35});
    const text=el('text',{x:7.2,y:.15,'text-anchor':'middle','dominant-baseline':'middle',fill:'#e3eed7','font-size':2.8,'font-family':'monospace'},train.id);
    group.append(title,ring,dot,badge,text);this.markers.append(group);
    const select=()=>{this.setSelectedTrain(train.id);this.onSelectTrain?.(train.id);};group.addEventListener('click',select);group.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select();}});
    const marker={group,title,ring,dot,position:[0,0,0]};this.trains.set(train.id,marker);return marker;
  }
  update(state) {
    this.state=state;
    for(const block of state.blocks) {
      const item=this.blocks.get(block.id);if(!item)continue;
      const status=block.blocked?'bloqué':block.occupiedBy?`occupé par ${block.occupiedBy}`:block.reservedBy?`réservé pour ${block.reservedBy}`:'libre';
      const color=block.blocked?'#e78673':block.occupiedBy?'#78dbac':block.reservedBy?'#e7c974':'#667b6b';
      item.line.setAttribute('stroke',this.mode==='plan'?item.segment.mapColor:color);
      item.line.setAttribute('stroke-dasharray',block.blocked?'1 1':this.mode==='plan'&&item.segment.uncertain?'2 1':'none');
      item.glow.setAttribute('opacity',block.occupiedBy ? .32 : block.reservedBy ? .14 : 0);
      if(item.overlay)item.overlay.setAttribute('display',this.mode==='plan'?'inline':'none');
      const note=item.segment.uncertain?' · connexion hypothétique':'';
      item.title.textContent=`${item.segment.name} · ${status}${note}`;
      item.group.setAttribute('aria-label',`${item.segment.name}, ${status}. Sélectionner.`);
    }
    for(const train of state.trains) {
      const marker=this.trains.get(train.id)||this.createTrain(train),pose=getTrainPose(train);marker.position=pose.position;
      marker.group.setAttribute('transform',`translate(${pose.position[0]} ${pose.position[2]})`);
      const underground=pose.position[1]<WORLD_LEVELS.exterior;
      marker.dot.setAttribute('fill',underground?'#87d6ea':'#cde3a1');marker.ring.setAttribute('opacity',train.id===this.selectedTrainId?'1':'0');
      marker.group.setAttribute('aria-pressed',String(train.id===this.selectedTrainId));
      const description=`${train.id} · ${train.blockId?TRACK.find(s=>s.id===train.blockId)?.name:'Garage fictif'} · ${pose.position[1].toFixed(1)} m · ${train.passengers} passagers`;
      marker.title.textContent=description;marker.group.setAttribute('aria-label',`${description}. Sélectionner.`);
    }
  }
  getTrainMapPosition(id) {const p=this.trains.get(id)?.position;return p?{x:p[0],y:p[2]}:null;}
  dispose(){this.svg.remove();this.trains.clear();this.blocks.clear();}
}

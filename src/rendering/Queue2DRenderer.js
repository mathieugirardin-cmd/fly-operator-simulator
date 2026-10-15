const NS='http://www.w3.org/2000/svg';
export const QUEUE_PATH_LENGTH=3000;
export const queuePathPoint=distance=>{const d=Math.max(0,Math.min(QUEUE_PATH_LENGTH,distance));return [30+d%270,60+Math.floor(d/270)*12];};
const area={queue:{x:35,y:85,cols:24,gap:10},fast:{x:35,y:220,cols:24,gap:10},single:{x:35,y:310,cols:24,gap:10},preshow:{x:355,y:105,cols:10,gap:11},lockers:{x:525,y:105,cols:12,gap:10},security:{x:705,y:105,cols:10,gap:10},ready:{x:865,y:105,cols:10,gap:10}};
export function queuePeople(state) {
  const counters={},assignments=new Map(state.lockers.items.filter(l=>l.assignedVisitor!==null).map(l=>[l.assignedVisitor,l]));
  const waiting=state.flow.people.map((p,index)=>{const zone=p.stage==='queue'&&p.lane!=='standard'?p.lane:p.stage==='transit'?p.transit.to:p.stage,n=counters[zone]||0;counters[zone]=n+1;const a=area[zone],l=assignments.get(p.id);return {id:p.id,zone,lane:p.lane,distance:Math.max(5,QUEUE_PATH_LENGTH-12-index*2.7),x:a.x+(n%a.cols)*a.gap,y:a.y+Math.floor(n/a.cols)*a.gap,preparation:l?.fault?'fault':zone};});
  const boarding=state.trains.flatMap(t=>t.boardingIds.map((id,index)=>({id,index,x:865+index%10*11,y:295+Math.floor(index/10)*12})));
  return {waiting,boarding};
}
const svg=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
export class Queue2DRenderer {
  constructor(container,{onCommand}={}) {
    this.container=container;this.people=new Map();this.lastTime=0;
    container.innerHTML=`<div class="queue-layout"><div class="queue-drawing"><div class="queue-metrics"><div><b id="queue-waiting">48</b><span>en préparation / 1000</span></div><div><b id="queue-boarding">0</b><span>vers le train</span></div><div><b id="queue-aboard">0</b><span>passagers à bord</span></div><span class="queue-state" id="queue-flow-state"></span></div><div class="queue-preparation" id="queue-preparation"></div><div class="queue-scroll"><svg id="queue-svg" class="queue-zones" viewBox="0 0 1010 375" role="img" aria-label="Parcours des visiteurs : un point représente une personne, depuis les deux files jusqu’au train."></svg></div><div class="queue-caption"><span><i></i>Standard</span><span><i class="boarding-dot"></i>Fast Pass</span><span><i class="deposit-dot"></i>Casiers</span><span><i class="seated-dot"></i>Prêts</span><small>1 POINT = 1 VISITEUR · SCHÉMA DE FLUX</small></div></div><div class="queue-controls"><div class="eyebrow">ACCUEIL STANDARD</div><button class="button" id="queue-entry-toggle" data-queue-command="TOGGLE_QUEUE">Suspendre les entrées</button><label for="queue-rate">Arrivées standard</label><select id="queue-rate"><option value="0">0 visiteur / min</option><option value="30">30 visiteurs / min</option><option value="60" selected>60 visiteurs / min</option><option value="120">120 visiteurs / min</option></select><button class="button" data-queue-command="ADD_VISITORS">Accueillir un groupe de 20</button><p id="queue-hint">Réglez les deux files, le préshow et les contrôles dans Opérations.</p><div class="queue-capacity"><i id="queue-capacity-fill"></i></div><small>Les visiteurs Fast Pass rejoignent aussi le préshow, les casiers et la sécurité. Aucune étape n’est contournée.</small></div></div>`;
    container.addEventListener('click',e=>{const b=e.target.closest('[data-queue-command]');if(b)onCommand(b.dataset.queueCommand,b.dataset.queueCommand==='ADD_VISITORS'?{amount:20}:{});});
    container.querySelector('#queue-rate').addEventListener('change',e=>onCommand('SET_ARRIVAL_RATE',{rate:Number(e.target.value)}));
    this.svg=container.querySelector('#queue-svg');this.labels={};
    const boxes=[['queue',20,45,280,155,'FILE STANDARD'],['fast',20,185,280,85,'FAST PASS'],['single',20,280,280,80,'SINGLE RIDER'],['preshow',340,65,140,200,'PRÉSHOW'],['lockers',510,65,145,200,'CASIERS'],['security',690,65,130,200,'SÉCURITÉ'],['ready',850,65,140,200,'PRÊTS À EMBARQUER']];
    for(const [id,x,y,w,h,title]of boxes){this.svg.append(svg('rect',{x,y,width:w,height:h,rx:8,fill:'#1c2b23',stroke:'#4d5c47'}));this.svg.append(svg('text',{x:x+10,y:y+20,fill:'#d3c291','font-size':10},title));const count=svg('text',{x:x+10,y:y+h-10,fill:'#a6bca3','font-size':11},'0 personne');this.svg.append(count);this.labels[id]=count;}
    this.svg.append(svg('path',{d:'M301 135H330 M301 285L332 155 M481 155H502 M656 155H681 M821 155H842 M920 267V287',stroke:'#9b8b63','stroke-width':2,fill:'none'}));
    this.trainLabel=svg('text',{x:850,y:330,fill:'#d4c39c','font-size':11},'AUCUN TRAIN À QUAI');this.svg.append(this.trainLabel);
    this.seats=[];for(let i=0;i<20;i++){const seat=svg('circle',{cx:864+Math.floor(i/2)*12,cy:345+i%2*12,r:4,fill:'#354936'});this.seats.push(seat);this.svg.append(seat);}
    this.dotLayer=svg('g',{'aria-hidden':true});this.svg.append(this.dotLayer);
  }
  update(state,dt=.1) {
    const $=id=>this.container.querySelector(id),v=state.visitors,f=state.flow,train=state.trains.find(t=>t.blockId==='LOAD'&&t.progress===1);
    $('#queue-waiting').textContent=v.queue;$('#queue-boarding').textContent=v.boarding;$('#queue-aboard').textContent=state.trains.reduce((n,t)=>n+t.passengers,0);
    $('#queue-entry-toggle').textContent=v.queueOpen?'Suspendre les entrées':'Ouvrir les entrées';
    if(document.activeElement!==$('#queue-rate'))$('#queue-rate').value=String(v.arrivalRate);
    $('#queue-capacity-fill').style.width=`${v.queue/state.flow.room.queueCapacity*100}%`;
    $('#queue-flow-state').textContent=state.emergency?'Arrêt d’urgence':state.open?'Parcours actif':'Attraction fermée';
    $('#queue-preparation').textContent=`Fusion ${f.ratio} standard / 1 Fast Pass · ${f.preshow.batch.length}/${f.preshow.capacity} au préshow · ${f.metrics.checks} contrôles effectués · ${f.metrics.returns} retours aux casiers.`;
    this.trainLabel.textContent=train?`${train.id} · ${train.passengers}/20`:'AUCUN TRAIN À QUAI';this.seats.forEach((dot,i)=>dot.setAttribute('fill',i<(train?.passengers||0)?'#acd69e':'#354936'));
    const data=queuePeople(state),alive=new Set();if(state.time<this.lastTime){this.people.forEach(p=>p.node.remove());this.people.clear();}this.lastTime=state.time;
    const counts={};
    for(const person of [...data.waiting,...data.boarding.map(p=>({...p,zone:'boarding',preparation:'boarding'}))]) {
      alive.add(person.id);counts[person.zone]=(counts[person.zone]||0)+1;let dot=this.people.get(person.id);
      if(!dot){const node=svg('circle',{r:3});this.dotLayer.append(node);dot={node,x:person.x,y:person.y};this.people.set(person.id,dot);}
      if(!state.emergency){const a=dt?Math.min(1,dt*8):1;dot.x+=(person.x-dot.x)*a;dot.y+=(person.y-dot.y)*a;}
      const color=({queue:'#99bfc0',single:'#c990e3',fast:'#dfbd79',preshow:'#b6a3cd',lockers:'#ca956f',security:'#a1c2e0',ready:'#acd69e',fault:'#e58478',boarding:'#dfbd79'})[person.preparation];
      dot.node.setAttribute('cx',dot.x.toFixed(2));dot.node.setAttribute('cy',dot.y.toFixed(2));dot.node.setAttribute('fill',color);dot.node.setAttribute('data-visitor-id',String(person.id));dot.node.setAttribute('data-zone',person.zone);
    }
    for(const [zone,label]of Object.entries(this.labels))label.textContent=`${counts[zone]||0} personne(s)`;
    for(const [id,dot]of this.people)if(!alive.has(id)){dot.node.remove();this.people.delete(id);}
    this.svg.setAttribute('aria-label',`Standard ${counts.queue||0}, Fast Pass ${counts.fast||0}, préshow ${counts.preshow||0}, casiers ${counts.lockers||0}, sécurité ${counts.security||0}, prêts ${counts.ready||0}, embarquement ${v.boarding}.`);
  }
  dispose(){this.container.replaceChildren();this.people.clear();}
}

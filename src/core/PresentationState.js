export const mmss=seconds=>`${String(Math.floor(Math.max(0,Math.ceil(seconds-1e-7))/60)).padStart(2,'0')}:${String(Math.max(0,Math.ceil(seconds-1e-7))%60).padStart(2,'0')}`;
export function showPresentation(s){
  const show=s.flow.preshow,phase=show.state==='INCIDENT'?show.resume:show.state;
  const incoming=s.flow.people.filter(p=>p.transit?.to==='preshow').length;
  const outgoing=s.flow.people.filter(p=>p.transit?.from==='preshow').length;
  const lockerOccupied=s.flow.people.filter(p=>p.stage==='lockers'||p.transit?.to==='lockers').length;
  const paused=s.runtime?.paused||s.emergency||show.state==='INCIDENT';
  const blocked=phase==='EXITING'&&lockerOccupied>=s.flow.room.lockerCapacity-2;
  const progress=phase==='PLAYING'?Math.min(1,show.elapsed/show.duration):phase==='EXITING'?1-(show.batch.length+outgoing)/Math.max(1,show.exitTotal):Math.min(1,(show.batch.length+incoming)/show.groupSize);
  const label=phase==='PLAYING'?`Séance · ${mmss(show.duration-show.elapsed)}`:phase==='EXITING'?`Vidage · ${show.batch.length+outgoing} personnes${blocked?' · aval plein':''}`:['OPENING','FILLING','FULL'].includes(phase)?`Remplissage · ${show.batch.length+incoming}/${show.groupSize}`:({CLOSED:'Fermé',READY:'Prêt à lancer',FINISHED:'Séance terminée'})[phase]||phase;
  const light=phase==='PLAYING'?1-.83*Math.min(1,show.elapsed/1.5,(show.duration-show.elapsed)/1.5):1;
  return {phase,label:`${label}${paused?' · PAUSE':''}`,progress,light,blocked};
}
// Capture only transition inputs. No sound is inferred from a button click or a rendered frame.
export function acousticState(s){return {doors:[s.station.gatesOpen,s.flow.preshow.entranceOpen,s.flow.preshow.exitOpen,...s.flow.security.stations.map(p=>p.open),s.lockers.intakeOpen,s.flow.room.lockerDoorOpen,...Object.values(s.flow.lanes).map(l=>l.open)],show:s.flow.preshow.state,trains:s.trains.map(t=>({id:t.id,harness:t.harness,departures:t.departures}))};}
export function acousticTransitions(before,after){
  const effects=[];
  after.doors.forEach((open,i)=>{if(open!==before.doors[i])effects.push({kind:'door',open});});
  if(after.show==='PLAYING'&&['READY','FULL'].includes(before.show))effects.push({kind:'show'});
  after.trains.forEach((t,i)=>{if(t.harness!==before.trains[i].harness)effects.push({kind:'harness',open:t.harness==='open'});if(t.departures>before.trains[i].departures)effects.push({kind:'dispatch'});});
  return effects;
}

// Renderer-only identities and slots. Simulation clocks and populations remain untouched.
export class VisitorVisualPool {
  constructor(create,hide=()=>{}){this.create=create;this.hide=hide;this.records=new Map();this.free=[];this.slots=new Map();this.holes=new Map();this.nextSlot=new Map();}
  acquire(id,zone){
    let record=this.records.get(id);
    if(!record){record={id,value:this.free.pop()||this.create(),zone:null,slot:0,point:null,transit:null};this.records.set(id,record);}
    if(record.zone!==zone){if(record.zone!==null)this.releaseSlot(record);let used=this.slots.get(zone);if(!used){used=new Set();this.slots.set(zone,used);this.holes.set(zone,[]);this.nextSlot.set(zone,0);}const holes=this.holes.get(zone),slot=holes.length?holes.pop():this.nextSlot.get(zone);if(slot===this.nextSlot.get(zone))this.nextSlot.set(zone,slot+1);used.add(slot);record.zone=zone;record.slot=slot;}
    return record;
  }
  releaseSlot(record){this.slots.get(record.zone)?.delete(record.slot);this.holes.get(record.zone)?.push(record.slot);}
  retain(ids){for(const [id,r]of this.records)if(!ids.has(id)){this.releaseSlot(r);this.hide(r.value);this.free.push(r.value);this.records.delete(id);}}
  reset(){this.retain(new Set());this.slots.clear();this.holes.clear();this.nextSlot.clear();}
}
export function individualBoardingProgress(train,id){
  if(train.passengerIds.includes(id))return 1;
  const offset=train.boardingIds.indexOf(id);if(offset<0||!train.loadingTarget)return 0;
  const ordinal=train.loadingTransferred+offset,finish=(ordinal+1)*6/train.loadingTarget,start=Math.max(0,finish-1.5);
  return Math.max(0,Math.min(1,(train.loadingElapsed-start)/Math.max(.01,finish-start)));
}

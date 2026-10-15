export const SHORTCUTS=['ArrowUp','ArrowDown','ArrowRight','Space','Enter'];
export class KeyboardController {
  constructor({state,command,blocked=()=>false}){this.getState=state;this.command=command;this.blocked=blocked;this.held=new Set();}
  down(event){
    if(!SHORTCUTS.includes(event.code)||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||this.blocked(event.target))return false;
    if(event.repeat||this.held.has(event.code))return false;
    this.held.add(event.code);
    const s=this.getState(),t=s.trains.find(t=>t.blockId==='LOAD'&&t.progress>=1&&t.state!=='GARAGING');
    if(!s.initialized||s.emergency||s.mode!=='manual'||s.runtime.paused||!t)return false;
    let type;
    if(event.code==='ArrowUp'&&!s.station.gatesOpen)type='TOGGLE_GATES';
    if(event.code==='ArrowDown'&&s.station.gatesOpen)type='TOGGLE_GATES';
    if(event.code==='ArrowRight')type='LOAD';
    if(event.code==='Space')type=t.harness==='open'?'CLOSE_HARNESSES':'OPEN_HARNESSES';
    if(event.code==='Enter')type=s.station.platformClear?'DISPATCH':'CLEAR_PLATFORM';
    if(!type)return false;
    this.command(type,{});event.preventDefault();return true;
  }
  up(event){this.held.delete(event.code);}
  release(){this.held.clear();}
}

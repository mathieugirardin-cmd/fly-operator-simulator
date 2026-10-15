import {showPresentation} from '../core/PresentationState.js';
// Original synthesized sounds only: no recordings, downloads or third-party music.
export class AudioDirector {
  constructor(factory=()=>new (window.AudioContext||window.webkitAudioContext)()){
    this.factory=factory;this.context=null;this.voices=new Set();this.musicBeat=null;this.showCycle=null;this.lastTone=-1;this.enabled=false;
  }
  async unlock(){
    try{if(!this.context){this.context=this.factory();this.master=this.context.createGain();this.music=this.context.createGain();this.music.connect(this.master);this.master.connect(this.context.destination);}this.enabled=true;if(this.context.state==='suspended'&&!this.state?.runtime.paused&&!this.state?.emergency&&!this.hidden)await this.context.resume();}
    catch{this.enabled=false;}
  }
  tone(frequency,duration=.15,music=false,type='sine',delay=0){
    const c=this.context;if(!c||!this.enabled||!this.state||this.state.audio.muted||this.state.runtime.paused||this.state.emergency||this.hidden||c.state!=='running')return;
    if(this.voices.size>=8)return;
    const osc=c.createOscillator(),gain=c.createGain(),start=c.currentTime+delay;
    osc.type=type;osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.09,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
    osc.connect(gain);gain.connect(music?this.music:this.master);this.voices.add(osc);
    osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();};osc.start(start);osc.stop(start+duration+.02);
  }
  effect(effect,s){
    this.state=s;
    if(effect.kind==='show'){this.showCycle=s.flow.preshow.cycles;this.musicBeat=-1;return;}
    // Coalesce simultaneous doors (automatic sequence) rather than stacking identical clicks.
    if(this.context&&this.context.currentTime-this.lastTone<.04)return;
    this.lastTone=this.context?.currentTime??-1;
    if(effect.kind==='door'){this.tone(effect.open?310:210,.18,false,'triangle');this.tone(effect.open?460:150,.12,false,'triangle',.09);}
    if(effect.kind==='harness'){this.tone(effect.open?730:390,.11,false,'square');this.tone(effect.open?550:270,.12,false,'triangle',.08);}
    if(effect.kind==='dispatch'){this.tone(440,.18);this.tone(660,.2,false,'sine',.15);this.tone(880,.3,false,'sine',.3);}
  }
  sync(s,hidden=false){
    this.state=s;this.hidden=hidden;
    const c=this.context;if(!c)return;
    this.master.gain.value=s.audio.muted?0:s.audio.volume;this.music.gain.value=s.audio.music;
    const suspended=hidden||s.runtime.paused||s.emergency;
    if(suspended){if(c.state==='running')c.suspend().catch(()=>{});return;}
    if(this.enabled&&c.state==='suspended')c.resume().catch(()=>{});
    const show=s.flow.preshow,phase=showPresentation(s).phase;
    if(phase!=='PLAYING'||show.state==='INCIDENT'){
      this.musicBeat=null;return;
    }
    const beat=Math.floor((show.elapsed+1e-7)*2);
    if(this.showCycle!==show.cycles){this.showCycle=show.cycles;this.musicBeat=beat;return;}
    if(this.musicBeat===null){this.musicBeat=beat;return;}
    if(beat===this.musicBeat)return;
    this.musicBeat=beat;
    const fanfare=[392,523.25,659.25,783.99],melody=[261.63,329.63,392,329.63,293.66,349.23,440,349.23];
    this.tone(beat<4?fanfare[beat]:melody[(beat-4)%melody.length],.35/s.runtime.speed,true,beat<4?'triangle':'sine');
  }
  reset(s){for(const v of this.voices)v.stop();this.voices.clear();this.showCycle=s.flow.preshow.cycles;this.musicBeat=Math.floor(s.flow.preshow.elapsed*2);this.state=s;}
}

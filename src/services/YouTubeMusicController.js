export const DEFAULT_PLAYLIST='PLGRue0erxvzZir-g8lcaAD422fpNvrUWO';
export const createMusicSettings=()=>({enabled:false,playlist:DEFAULT_PLAYLIST,showVideo:'',volume:35,muted:false});
export function videoId(value){
  if(/^[\w-]{11}$/.test(value))return value;
  try{const u=new URL(value);if(u.hostname==='youtu.be')return videoId(u.pathname.slice(1));if(['www.youtube.com','youtube.com','m.youtube.com'].includes(u.hostname))return videoId(u.searchParams.get('v')||u.pathname.split('/').at(-1)||'');}catch{}return '';
}
export function validateMusicSettings(m,assert){assert(m&&typeof m.enabled==='boolean'&&typeof m.muted==='boolean'&&typeof m.playlist==='string'&&/^[\w-]{10,100}$/.test(m.playlist)&&typeof m.showVideo==='string'&&(m.showVideo===''||/^[\w-]{11}$/.test(m.showVideo))&&Number.isInteger(m.volume)&&m.volume>=0&&m.volume<=100,'réglages YouTube invalides.');}
let apiPromise;
export function loadYouTubeAPI(){
  if(globalThis.YT?.Player)return Promise.resolve(globalThis.YT);
  if(!apiPromise)apiPromise=new Promise((resolve,reject)=>{
    const previous=globalThis.onYouTubeIframeAPIReady;
    const timer=setTimeout(()=>reject(new Error('YouTube ne répond pas.')),15000);
    globalThis.onYouTubeIframeAPIReady=()=>{previous?.();clearTimeout(timer);resolve(globalThis.YT);};
    const script=document.createElement('script');script.id='youtube-iframe-api';script.src='https://www.youtube.com/iframe_api';script.async=true;script.onerror=()=>{clearTimeout(timer);reject(new Error('Connexion YouTube indisponible.'));};document.head.append(script);
  }).catch(error=>{apiPromise=null;document.getElementById('youtube-iframe-api')?.remove();throw error;});return apiPromise;
}
export class YouTubeMusicController {
  constructor({host,loadAPI=loadYouTubeAPI,onStatus=()=>{}}={}){this.host=host;this.loadAPI=loadAPI;this.onStatus=onStatus;this.generation=0;this.player=null;this.ready=false;this.playWanted=false;this.mode='ambient';this.ambient=null;this.playlist=[];this.activeKey=null;this.applied=null;this.loading=false;this.failed=false;this.playing=false;this.status='YouTube désactivé · sons locaux conservés';}
  message(text){this.status=text;this.onStatus(text);}
  call(method,...args){try{return this.player?.[method]?.(...args);}catch{this.fail('Le lecteur YouTube est indisponible.');}}
  fail(message){this.failed=true;this.playing=false;try{this.player?.pauseVideo?.();}catch{}this.message(message+' · le jeu continue.');}
  async mount(){
    if(this.player||this.loading||!this.state?.music.enabled)return;this.loading=true;const generation=this.generation;
    this.message('Chargement du lecteur YouTube…');
    try{
      const api=await this.loadAPI();if(generation!==this.generation||!this.state.music.enabled)return;
      this.host.replaceChildren();const target=document.createElement('div');this.host.append(target);
      this.player=new api.Player(target,{width:'100%',height:'200',playerVars:{playsinline:1,controls:1,origin:location.origin},events:{
        onReady:()=>{if(generation!==this.generation)return;clearTimeout(this.readyTimer);this.ready=true;this.failed=false;this.call('cuePlaylist',{listType:'playlist',list:this.state.music.playlist});this.message('Lecteur prêt · cliquez Lecture si nécessaire.');this.apply();},
        onStateChange:event=>{if(generation!==this.generation||!this.state?.music.enabled)return;this.playing=event.data===1;if(this.playing&&!this.paused)this.playWanted=true;this.readPlaylist();if(event.data===5){this.transport=null;this.apply();}if(this.paused)this.call('pauseVideo');if(this.playing&&!this.paused)this.message(this.mode==='show'?'Musique du préshow':'Ambiance YouTube');},
        onAutoplayBlocked:()=>{if(generation!==this.generation)return;this.playing=false;this.playWanted=false;this.message('Lecture bloquée · cliquez Lecture dans le lecteur YouTube.');},
        onError:event=>{if(generation!==this.generation)return;clearTimeout(this.readyTimer);this.fail(`YouTube : ${[101,150].includes(event.data)?'intégration refusée':event.data===100?'vidéo indisponible':event.data===153?'identification du lecteur refusée':`erreur ${event.data}`}`);},
      }});
      this.readyTimer=setTimeout(()=>{if(generation===this.generation&&!this.ready)this.fail('Le lecteur YouTube ne répond pas.');},15000);
    }catch(error){if(generation===this.generation)this.fail(error.message||'Échec réseau YouTube');}
    finally{if(generation===this.generation)this.loading=false;}
  }
  readPlaylist(){
    const ids=this.call('getPlaylist');if(!Array.isArray(ids))return;
    const filtered=ids.filter(id=>id!==this.state.music.showVideo);
    if(filtered.join()!==this.playlist.join()){this.playlist=filtered;if(this.mode==='ambient'){this.applied=null;this.apply();}}
    if(!filtered.length&&this.mode==='ambient'){this.call('pauseVideo');this.message('Playlist vide ou sans piste d’ambiance disponible.');}
  }
  currentVideo(){return this.call('getVideoData')?.video_id||'';}
  update(s,{hidden=false,modal=false}={}){
    this.state=s;this.paused=hidden||modal||s.runtime.paused||s.emergency||s.flow.preshow.state==='INCIDENT'&&this.mode==='show';
    if(!s.music.enabled){if(this.player||this.loading)this.destroy();return;}
    if(!this.player&&!this.loading&&!this.failed)this.mount();
    const phase=s.flow.preshow.state==='INCIDENT'?s.flow.preshow.resume:s.flow.preshow.state;
    const key=phase==='PLAYING'?`show:${s.flow.preshow.cycles}:${s.music.showVideo}`:null;
    if(key!==this.activeKey){
      if(key&&s.music.showVideo){if(this.mode==='ambient')this.ambient={id:this.currentVideo(),time:this.call('getCurrentTime')||0,index:this.call('getPlaylistIndex')||0};this.mode='show';this.message('Chargement du morceau préshow…');}
      else if(!key&&this.mode==='show'){this.mode='ambient';this.message('Reprise de l’ambiance…');}
      this.activeKey=key;this.applied=null;
    }
    const config=`${s.music.playlist}:${s.music.showVideo}`;
    if(this.config&&this.config!==config){this.playlist=[];this.applied=null;if(this.ready)this.call('cuePlaylist',{listType:'playlist',list:s.music.playlist});}
    this.config=config;this.apply();
  }
  apply(){
    if(!this.ready||this.failed||!this.state?.music.enabled)return;
    const m=this.state.music;this.call('setVolume',m.volume);this.call(m.muted?'mute':'unMute');
    const target=this.mode==='show'&&m.showVideo?this.activeKey:`ambient:${m.playlist}:${this.playlist.join()}`;
    if(this.applied!==target){
      this.applied=target;this.transport=null;
      if(this.mode==='show'&&m.showVideo)this.call('cueVideoById',{videoId:m.showVideo,startSeconds:0});
      else if(this.playlist.length){const index=Math.max(0,this.playlist.indexOf(this.ambient?.id));this.call('cuePlaylist',this.playlist,index,this.ambient?.time||0);this.ambient=null;}
    }
    if(this.paused||!this.playWanted){if(this.transport!=='pause')this.call('pauseVideo');this.transport='pause';this.playing=false;}
    else if(this.transport!=='play'){this.transport='play';this.call('playVideo');}
  }
  play(s){if(this.failed&&this.player&&!this.ready)this.destroy();this.failed=false;this.playWanted=true;this.transport=null;this.update(s);}
  pause(){this.playWanted=false;this.call('pauseVideo');this.transport='pause';this.playing=false;}
  next(){if(this.mode==='show'){this.message('La séance garde son morceau ; le timer du jeu reste maître.');return;}this.call('nextVideo');}
  get providesShowMusic(){return this.mode==='show'&&this.playing&&!this.failed&&!!this.state?.music.showVideo&&this.currentVideo()===this.state.music.showVideo;}
  destroy(){clearTimeout(this.readyTimer);this.generation++;try{this.player?.destroy?.();}catch{}this.player=null;this.ready=false;this.loading=false;this.playing=false;this.applied=null;this.host?.replaceChildren();}
  reset(s){this.pause();this.destroy();this.failed=false;this.mode='ambient';this.ambient=null;this.activeKey=null;this.playlist=[];this.state=s;this.message('Cliquez Lecture pour activer YouTube.');}
}

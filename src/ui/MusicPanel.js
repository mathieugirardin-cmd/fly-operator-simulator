import {videoId} from '../services/YouTubeMusicController.js';
export class MusicPanel {
 constructor(root,{onCommand,onPlay,onPause,onNext,onDisable}){
  this.dock=document.createElement('section');this.dock.className='music-dock';this.dock.hidden=true;
  this.dock.innerHTML='<div class="music-heading"><b>YOUTUBE · AMBIANCE</b><button data-music="disable" aria-label="Désactiver YouTube">×</button></div><div class="youtube-host"></div><div class="music-controls"><button data-music="play">▶ Lecture</button><button data-music="pause">Ⅱ Pause</button><button data-music="next">Suivant ⏭</button></div><p class="music-status" role="status">Cliquez Lecture pour activer YouTube.</p>';
  root.querySelector('.console-music-slot').append(this.dock);this.host=this.dock.querySelector('.youtube-host');this.status=this.dock.querySelector('.music-status');
  this.settings=document.createElement('article');this.settings.className='ops-card ops-wide';this.settings.id='flow-youtube';this.settings.innerHTML='<h3>YouTube · playlist et préshow</h3><p>Lecteur officiel visible, connexion Internet nécessaire. Les effets de portes, harnais et départ restent locaux.</p><div class="ops-fields"><label>Playlist (ID)<input id="youtube-playlist" type="text"></label><label>Morceau préshow (URL ou ID vidéo)<input id="youtube-show" type="text" placeholder="Choisir une vidéo"></label><label>Choisir dans la playlist<select id="youtube-tracks"><option value="">Attendre le chargement du lecteur</option></select></label><label>Volume YouTube<input id="youtube-volume" type="range" min="0" max="100" step="1"></label></div><label><input id="youtube-muted" type="checkbox"> Sourdine YouTube</label><div class="ops-buttons"><button class="button" data-music="enable">Activer le lecteur visible</button><button class="button" data-music="disable">Désactiver YouTube</button></div><p id="youtube-config-status"></p>';
  root.querySelector('#operations-workbench .ops-grid').append(this.settings);
  const command=(field,value)=>onCommand('SET_YOUTUBE',{field,value});
  this.settings.querySelector('#youtube-playlist').addEventListener('change',e=>command('playlist',e.target.value.trim()));
  this.settings.querySelector('#youtube-show').addEventListener('change',e=>{const id=videoId(e.target.value.trim());if(id||!e.target.value.trim())command('showVideo',id);else this.settings.querySelector('#youtube-config-status').textContent='URL ou ID vidéo non reconnu.';});
  this.settings.querySelector('#youtube-tracks').addEventListener('change',e=>command('showVideo',e.target.value));
  this.settings.querySelector('#youtube-volume').addEventListener('input',e=>command('volume',Number(e.target.value)));
  this.settings.querySelector('#youtube-muted').addEventListener('change',e=>command('muted',e.target.checked));
  for(const parent of [this.dock,this.settings])parent.addEventListener('click',e=>{const button=e.target.closest('[data-music]');if(!button)return;const action=button.dataset.music;if(action==='disable'){onDisable();command('enabled',false);}if(action==='enable'||action==='play'){command('enabled',true);onPlay();}if(action==='pause')onPause();if(action==='next')onNext();});
 }
 message(text){this.status.textContent=text;this.settings.querySelector('#youtube-config-status').textContent=text;}
 update(s,controller){
  // Keep the iframe in the same DOM parent: moving it reloads YouTube.
  const shell=this.dock.closest('.console-shell');
  this.dock.hidden=!s.music.enabled;this.dock.closest('.console-shell').classList.toggle('has-youtube',s.music.enabled);
  const values={playlist:s.music.playlist,show:s.music.showVideo,volume:s.music.volume};for(const [key,value]of Object.entries(values)){const input=this.settings.querySelector(`#youtube-${key}`);if(document.activeElement!==input)input.value=value;}
  this.settings.querySelector('#youtube-muted').checked=s.music.muted;
  const ids=[...new Set([...controller.playlist,...(s.music.showVideo?[s.music.showVideo]:[])])],key=ids.join();if(key!==this.trackKey){this.trackKey=key;const select=this.settings.querySelector('#youtube-tracks');select.replaceChildren(new Option('Choisir le morceau préshow',''),...ids.map(id=>new Option(id,id)));}this.settings.querySelector('#youtube-tracks').value=s.music.showVideo;
 }
}

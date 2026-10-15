import {describe,it,expect,vi,afterEach} from 'vitest';
import {YouTubeMusicController,createMusicSettings,videoId} from '../services/YouTubeMusicController.js';
const A='aaaaaaaaaaa',B='bbbbbbbbbbb',C='ccccccccccc';
const state=()=>({music:{...createMusicSettings(),enabled:true,showVideo:B},runtime:{paused:false},emergency:false,flow:{preshow:{state:'FILLING',resume:null,cycles:0}}});
const setup=async()=>{
 vi.stubGlobal('document',{createElement:()=>({})});vi.stubGlobal('location',{origin:'http://localhost'});
 let events,video=A,ids=[A,B,C],time=42;
 const player={cuePlaylist:vi.fn((list)=>{if(Array.isArray(list))ids=list;}),cueVideoById:vi.fn(p=>video=p.videoId),playVideo:vi.fn(),pauseVideo:vi.fn(),nextVideo:vi.fn(),setVolume:vi.fn(),mute:vi.fn(),unMute:vi.fn(),getPlaylist:()=>ids,getPlaylistIndex:()=>0,getCurrentTime:()=>time,getVideoData:()=>({video_id:video}),destroy:vi.fn()};
 const factory=vi.fn(function(_element,options){events=options.events;return player;});
 const s=state(),controller=new YouTubeMusicController({host:{replaceChildren:vi.fn(),append:vi.fn()},loadAPI:async()=>({Player:factory})});controller.state=s;await controller.mount();events.onReady();controller.readPlaylist();return {s,controller,player,events,factory};
};
afterEach(()=>vi.unstubAllGlobals());
describe('contrôleur YouTube indépendant du moteur',()=>{
 it('une transition par séance, exclusion du titre préshow et reprise de la piste/position',async()=>{
  const {s,controller:c,player:p}=await setup();c.play(s);expect(c.playlist).toEqual([A,C]);s.flow.preshow.state='PLAYING';c.update(s);c.update(s);expect(p.cueVideoById).toHaveBeenCalledTimes(1);expect(p.cueVideoById).toHaveBeenCalledWith({videoId:B,startSeconds:0});
  s.runtime.paused=true;c.update(s);expect(p.pauseVideo).toHaveBeenCalled();const loads=p.cueVideoById.mock.calls.length;s.runtime.paused=false;c.update(s);expect(p.cueVideoById).toHaveBeenCalledTimes(loads);
  s.flow.preshow.state='FINISHED';s.flow.preshow.cycles++;c.update(s);expect(p.cuePlaylist).toHaveBeenLastCalledWith([A,C],0,42);c.update(s);expect(p.cueVideoById).toHaveBeenCalledTimes(1);
 });
 it('incident et pause ne redémarrent pas la séance et les commandes ne se répètent pas par frame',async()=>{
  const {s,controller:c,player:p}=await setup();c.play(s);s.flow.preshow.state='PLAYING';c.update(s);const plays=p.playVideo.mock.calls.length;for(let i=0;i<100;i++)c.update(s);expect(p.playVideo).toHaveBeenCalledTimes(plays);
  s.flow.preshow.state='INCIDENT';s.flow.preshow.resume='PLAYING';c.update(s);s.flow.preshow.state='PLAYING';s.flow.preshow.resume=null;c.update(s);expect(p.cueVideoById).toHaveBeenCalledTimes(1);
 });
 it('gère refus d’intégration et lecture bloquée sans modifier l’état du jeu',async()=>{
  const {s,controller:c,events}=await setup();const original=structuredClone(s);events.onAutoplayBlocked();expect(c.status).toMatch(/cliquez/i);events.onError({data:150});expect(c.failed).toBe(true);expect(c.providesShowMusic).toBe(false);expect(s).toEqual(original);expect(()=>c.update(s)).not.toThrow();
 });
 it('ignore un chargement tardif après une nouvelle partie/restauration',async()=>{
  let resolve;const factory=vi.fn(),pending=new Promise(r=>resolve=r),s=state(),c=new YouTubeMusicController({host:{replaceChildren:vi.fn()},loadAPI:()=>pending});c.state=s;const mounting=c.mount();c.reset({...s,music:createMusicSettings()});resolve({Player:factory});await mounting;expect(factory).not.toHaveBeenCalled();expect(c.player).toBe(null);
 });
 it('réagit au lecteur natif et ne modifie jamais la vitesse de lecture YouTube',async()=>{const {s,controller:c,events,player:p}=await setup();events.onStateChange({data:1});expect(c.playWanted).toBe(true);s.runtime.speed=4;c.update(s);expect(p).not.toHaveProperty('setPlaybackRate');c.next();expect(p.nextVideo).toHaveBeenCalledTimes(1);});
 it('reprend la lecture lorsque le chargement asynchrone annonce une piste prête',async()=>{const {s,controller:c,player:p,events}=await setup();c.play(s);s.flow.preshow.state='PLAYING';c.update(s);const cues=p.cueVideoById.mock.calls.length,plays=p.playVideo.mock.calls.length;events.onStateChange({data:5});expect(p.playVideo).toHaveBeenCalledTimes(plays+1);expect(p.cueVideoById).toHaveBeenCalledTimes(cues);s.runtime.paused=true;c.update(s);const pausedPlays=p.playVideo.mock.calls.length;events.onStateChange({data:5});expect(p.playVideo).toHaveBeenCalledTimes(pausedPlays);});
 it('accepte URL officielle/ID, rejette les autres destinations sans inventer de titre',()=>{expect(videoId(`https://www.youtube.com/watch?v=${B}`)).toBe(B);expect(videoId(`https://youtu.be/${B}`)).toBe(B);expect(videoId(`https://example.com/${B}`)).toBe('');expect(videoId('titre inventé')).toBe('');});
});

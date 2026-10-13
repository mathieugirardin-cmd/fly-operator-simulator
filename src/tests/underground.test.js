import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {TRACK,STATIONS,WORLD_LEVELS,createTrack,makeStationLayout,worldToPlan,stationLocalToWorld} from '../config/track.js';
import {sampleTrack,getSegmentSamples} from '../rendering/TrackGeometry.js';
import {createStationShell,stationCamera} from '../scenes/UndergroundStation.js';

describe('reconstruction en volume du plan de référence',()=>{
  it('garde les deux gares sur les deux traits cyan du plan, sous le niveau extérieur',()=>{
    expect(STATIONS.loading.start[1]).toBeLessThan(0);expect(STATIONS.unloading.start[1]).toBeLessThan(0);
    for(const [name,pixels] of [['loading',[[1395,652],[1395,397]]],['unloading',[[1012,293],[1288,293]]]]) {
      const s=STATIONS[name];
      for(const [i,p]of[s.start,s.end].entries())worldToPlan(p[0],p[2]).forEach((v,a)=>expect(v).toBeCloseTo(pixels[i][a],8));
    }
  });
  it('forme une boucle continue, des quais souterrains aux portions aériennes',()=>{
    for(let i=0;i<TRACK.length;i++) {
      const a=sampleTrack(TRACK[i],1),b=sampleTrack(TRACK[(i+1)%TRACK.length],0);
      a.position.forEach((v,k)=>expect(v).toBeCloseTo(b.position[k],8));
      expect(a.tangent.reduce((sum,v,k)=>sum+v*b.tangent[k],0)).toBeGreaterThan(0);
    }
    const ys=TRACK.flatMap(s=>getSegmentSamples(s,300).map(p=>p[1]));
    expect(Math.min(...ys)).toBeLessThan(-6);expect(Math.max(...ys)).toBeGreaterThan(25);
  });
  it('permet de régler les altitudes sans déplacer les repères du plan 2D',()=>{
    const levels={...WORLD_LEVELS,stationRail:-9,stationFloor:-12.6,stationCeiling:-4,launch1:9,summit:34};
    const track=createTrack(levels),stations=makeStationLayout(track,levels);
    expect(track.map(s=>s.points.map(p=>[p[0],p[2]]))).toEqual(TRACK.map(s=>s.points.map(p=>[p[0],p[2]])));
    expect(stations.loading.rail).toBe(-9);expect(stations.loading.ceiling).toBe(-4);
    expect(Math.max(...track.flatMap(s=>s.points.map(p=>p[1])))).toBe(34);
    expect(()=>createTrack({stationCeiling:1})).toThrow();
    expect(()=>createTrack({stationFloor:-3})).toThrow();
  });
  it.each(Object.values(STATIONS))('enferme la caméra $id sous un vrai plafond et entre des murs solides',station=>{
    const material=new THREE.MeshBasicMaterial();
    const shell=createStationShell(station,{concrete:material,floor:material,brick:material,steel:material,roof:material});
    shell.group.updateMatrixWorld(true);
    const eye=new THREE.Vector3(...stationLocalToWorld(station,0,station.rail,0));
    for(const direction of [[0,1,0],[-station.direction[2],0,station.direction[0]],[station.direction[2],0,-station.direction[0]]]) {
      const hit=new THREE.Raycaster(eye,new THREE.Vector3(...direction),0,20).intersectObject(shell.group,true);
      expect(hit.length).toBeGreaterThan(0);expect(hit[0].object.material.transparent).toBe(false);
    }
    // The rail portals remain open for arriving and departing trains.
    for(const sign of [-1,1])expect(new THREE.Raycaster(eye,new THREE.Vector3(...station.direction).multiplyScalar(sign),0,station.length/2+4).intersectObject(shell.group,true)).toHaveLength(0);
    const camera=stationCamera(station);
    expect(camera.position[1]).toBeGreaterThan(station.floor);expect(camera.position[1]).toBeLessThan(station.ceiling);
    expect(shell.ceiling.position.y).toBeLessThan(WORLD_LEVELS.exterior);
  });
});

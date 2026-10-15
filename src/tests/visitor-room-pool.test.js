import {it,expect,vi} from 'vitest';
import * as THREE from 'three';
vi.mock('../scenes/ScenePrimitives.js',()=>({box:(group,material,x=0,y=0,z=0)=>{const mesh=new THREE.Group();mesh.material=material;mesh.position.set(x,y,z);group.add(mesh);return mesh;},ball:(group)=>{const mesh=new THREE.Group();group.add(mesh);return mesh;},textSign:()=>{}}));
import {VisitorRooms} from '../scenes/VisitorRooms.js';
import {SimulationEngine} from '../core/SimulationEngine.js';
it('conserve les meshes et positions des voisins quand le premier visiteur sort',()=>{
 const scene=new THREE.Scene(),m=new Proxy({},{get:()=>new THREE.MeshBasicMaterial()}),rooms=new VisitorRooms(scene,m),e=new SimulationEngine(),s=e.state;
 s.flow.people=s.flow.people.slice(0,3).map(p=>({...p,stage:'preshow'}));s.flow.preshow.batch=[1,2,3];rooms.show('preshow');rooms.update(s,.1,m);
 const pool=rooms.rooms.preshow.pool,a=pool.records.get(1),b=pool.records.get(2),c=pool.records.get(3),bPos=b.value.position.clone(),cPos=c.value.position.clone(),start=a.value.position.clone();
 s.flow.people[0].stage='transit';s.flow.people[0].transit={from:'preshow',to:'lockers',remaining:2,duration:2};s.flow.preshow.batch=[2,3];rooms.update(s,.1,m);
 expect(pool.records.get(2)).toBe(b);expect(b.value.position.equals(bPos)).toBe(true);expect(c.value.position.equals(cPos)).toBe(true);expect(a.value.position.equals(start)).toBe(true);
 s.flow.people[0].transit.remaining=1;rooms.update(s,.1,m);expect(a.value.position.distanceTo(start)).toBeGreaterThan(0);expect(b.value.position.equals(bPos)).toBe(true);
 s.flow.people.shift();rooms.update(s,.1,m);expect(pool.records.has(1)).toBe(false);expect(pool.records.get(2)).toBe(b);rooms.reset();expect(pool.records.size).toBe(0);
});

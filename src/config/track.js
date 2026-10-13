// Positionnement relevé sur le plan utilisateur 1536 × 1144.
// Échelle scénique et altitudes HYPOTHÉTIQUES, indépendantes des cantons fictifs.
export const PLAN = Object.freeze({ width:1536, height:1144, scale:.12, origin:[768,572] });
export const WORLD_LEVELS = Object.freeze({
  exterior:0, stationRail:-7, stationFloor:-10.6, stationCeiling:-2,
  garageRail:-7, returnTunnel:-16, launch1:7, launch2:10, low:6, medium:14, high:23, summit:29,
});
export const planToWorld = (x,z,height=0) => [(x-PLAN.origin[0])*PLAN.scale,height,(z-PLAN.origin[1])*PLAN.scale];
export const worldToPlan = (x,z) => [x/PLAN.scale+PLAN.origin[0],z/PLAN.scale+PLAN.origin[1]];
export const MAP_COLORS = Object.freeze({station:'#70c6dc',launch:'#a26bdd',first:'#d35855',second:'#dca04b',brakes:'#557bd8',motor:'#75ba6e',connection:'#889187'});

export function createTrack(overrides={}) {
  const h={...WORLD_LEVELS,...overrides};
  if(!Object.values(h).every(Number.isFinite) || !(h.stationFloor<h.stationRail && h.stationRail<h.stationCeiling && h.stationCeiling<h.exterior)) throw new Error('Altitudes invalides : sol < rail < plafond < extérieur.');
  const segment=(id,name,type,length,maxSpeed,camera,color,points,uncertain=false)=>({id,name,type,length,maxSpeed,camera,mapColor:MAP_COLORS[color],uncertain,points:points.map(([x,z,y])=>planToWorld(x,z,y)),planPoints:points.map(([x,z])=>[x,z])});
  const track = [
    segment('UNLOAD','Gare souterraine · Débarquement','unloading',33,7,'CAM02','station',[[1012,293,h.stationRail],[1104,293,h.stationRail],[1196,293,h.stationRail],[1288,293,h.stationRail]]),
    segment('TRANSFER','Liaison des gares · hypothèse','transfer',62,7,'CAM02','connection',[[1288,293,h.stationRail],[1345,293,h.stationRail],[1450,330,h.stationRail],[1500,400,h.stationRail],[1510,540,h.stationRail],[1500,650,h.stationRail],[1460,715,h.stationRail],[1408,707,h.stationRail],[1395,695,h.stationRail],[1395,652,h.stationRail]],true),
    segment('LOAD','Gare souterraine · Embarquement','loading',31,7,'CAM01','station',[[1395,652,h.stationRail],[1395,567,h.stationRail],[1395,482,h.stationRail],[1395,397,h.stationRail]]),
    segment('DEPART','Sortie souterraine et montée motorisée','departure',96,8,'CAM01','motor',[[1395,397,h.stationRail],[1395,337,h.stationRail],[1390,243,h.stationRail],[1355,178,h.stationRail],[1325,180,h.stationRail],[1355,235,h.stationRail],[1355,270,-1+h.exterior],[1355,300,4+h.exterior],[1355,360,h.low],[1355,420,h.low],[1355,495,h.low],[1345,560,h.low],[1320,585,h.low],[1252,585,h.launch1]],true),
    segment('LAUNCH1','Lancement 01','launch',98,19,'CAM03','launch',[[1252,585,h.launch1],[990,526,h.launch1],[725,466,h.launch1],[460,408,h.launch1]]),
    segment('COURSE1','Parcours rouge · première partie','course',325,18,'CAM03','first',[
      [460,408,h.launch1],[322,379,h.medium],[238,391,h.high],[208,445,h.high],[206,514,h.medium],[250,559,h.low],[368,585,h.low],[512,603,h.medium],[655,664,h.high],[742,765,h.high],[800,799,h.medium],[915,760,h.medium],[1110,620,h.high],[1225,434,h.high],[1260,310,h.summit],[1220,213,h.summit],[1155,167,h.high],[1090,174,h.high],[1020,246,h.medium],[958,347,h.medium],[854,440,h.high],[728,481,h.high],[608,552,h.medium],[578,620,h.medium],[633,770,h.high],[724,797,h.high],[822,748,h.medium],[882,637,h.medium],[892,463,h.high],[905,335,h.high],[966,271,h.high],[1040,268,h.medium],[1102,340,h.medium],[1160,463,h.high],[1266,615,h.high],[1362,708,h.medium],[1400,784,h.medium],[1375,844,h.low],[1301,870,h.low],[1196,867,h.medium],[1110,826,h.high],[800,760,h.high],[605,664,h.high],[470,550,h.high],[460,448,h.medium],[535,492,h.low]
    ]),
    segment('LAUNCH2','Lancement 02','launch',59,22,'CAM04','launch',[[535,492,h.low],[675,572,h.launch2],[816,652,h.launch2],[956,731,h.launch2]]),
    segment('COURSE2','Parcours orange · deuxième partie','course',335,18,'CAM04','second',[
      [956,731,h.launch2],[1100,807,h.medium],[1200,871,h.medium],[1270,870,h.high],[1320,809,h.high],[1314,744,h.medium],[1264,700,h.medium],[1197,690,h.medium],[1083,746,h.high],[942,864,h.high],[843,923,h.medium],[757,928,h.low],[684,899,h.low],[667,835,h.medium],[687,754,h.high],[732,644,h.high],[780,483,h.high],[820,360,h.summit],[817,307,h.summit],[786,270,h.high],[732,257,h.medium],[644,282,h.medium],[549,362,h.high],[435,455,h.high],[355,494,h.high],[287,497,h.low],[248,477,h.low],[229,427,h.medium],[242,377,h.medium],[287,357,h.medium],[370,379,h.high],[490,460,h.high],[597,550,h.high],[701,581,h.high],[716,615,h.medium],[714,634,h.medium]
    ]),
    segment('BRAKES','Freinage final','brakes',48,7,'CAM02','brakes',[[714,634,h.medium],[826,704,h.medium],[938,775,h.medium],[1050,845,h.medium]]),
    segment('RETURN','Retour souterrain · liaison hypothétique','return',104,7,'CAM02','connection',[[1050,845,h.medium],[1120,901,h.medium],[1226,944,h.low],[1344,915,3+h.exterior],[1424,826,-1+h.exterior],[1464,691,h.returnTunnel],[1478,506,h.returnTunnel],[1478,309,h.returnTunnel],[1430,209,h.returnTunnel],[1320,142,h.returnTunnel],[1160,168,h.returnTunnel],[1070,187,h.stationRail-4],[1011,195,h.stationRail],[966,237,h.stationRail],[973,293,h.stationRail],[1012,293,h.stationRail]],true),
  ];
  const departure=track.find(s=>s.id==='DEPART');
  departure.mapColor=MAP_COLORS.connection;
  // Only the straight green stroke is classified as motorized on the reference.
  departure.mapOverlay={points:departure.points.slice(5,11),color:MAP_COLORS.motor};
  return track;
}
export const TRACK=createTrack();
export const TRACK_BY_ID=Object.fromEntries(TRACK.map(s=>[s.id,s]));
export const NEXT_BLOCK=Object.fromEntries(TRACK.map((s,i)=>[s.id,TRACK[(i+1)%TRACK.length].id]));
export const makeStationLayout=(track=TRACK,levels=WORLD_LEVELS)=>Object.fromEntries([['loading','LOAD'],['unloading','UNLOAD']].map(([name,id])=>{
  const segment=track.find(s=>s.id===id),start=segment.points[0],end=segment.points.at(-1);
  const length=Math.hypot(end[0]-start[0],end[2]-start[2]);
  return [name,{id:name,blockId:id,start,end,center:start.map((v,i)=>(v+end[i])/2),direction:[(end[0]-start[0])/length,0,(end[2]-start[2])/length],length,width:13,floor:levels.stationFloor,ceiling:levels.stationCeiling,rail:start[1],wallThickness:.5}];
}));
export const STATIONS=makeStationLayout();
export function stationLocalToWorld(station,x,y,z) {
  const [dx,,dz]=station.direction;
  return [station.center[0]+dx*x-dz*z,y,station.center[2]+dz*x+dx*z];
}
export const LANDMARKS=[
  ['tower1','Tower 1',[[324,145],[497,134],[510,233],[335,242]],17],
  ['tower2','Tower 2',[[335,245],[529,306],[506,393],[313,335]],19],
  ['tower3','Tower 3',[[286,400],[480,511],[446,562],[250,474]],16],
  ['tower4','Tower 4 ?',[[363,631],[540,630],[581,725],[615,819],[564,814],[508,715],[385,712]],15],
  ['restaurant','Restaurant',[[506,149],[731,149],[730,309],[526,312]],11],
].map(([id,label,points,height])=>({id,label,height,polygon:points.map(([x,z])=>{const p=planToWorld(x,z);return[p[0],p[2]];}),uncertain:id==='tower4'}));
// Garage non identifié par les photographies : position de jeu explicitement fictive.
export const GARAGE={origin:planToWorld(1470,790,WORLD_LEVELS.garageRail),direction:[0,0,-1],spacing:5,length:29};
export function garagePose(index) {
  const [dx,,dz]=GARAGE.direction;
  return {position:[GARAGE.origin[0]-dz*index*GARAGE.spacing,GARAGE.origin[1],GARAGE.origin[2]+dx*index*GARAGE.spacing],tangent:[...GARAGE.direction],bank:0};
}
export const SIMULATION_CONFIG=Object.freeze({fixedStep:.1,queueCapacity:240,initialQueue:48,loadingDuration:6,unloadingDuration:2,automaticActionInterval:.7,eventLimit:100});

import 'fake-indexeddb/auto';
import test from 'node:test';import assert from 'node:assert/strict';
import {ProjectSession,createProject,duplicateProject,getProject,listProjects,updateProject,exportProjectFile,importProjectFile,projectMediaIds,validateSnapshot} from '../project-store.mjs';
import {storeRequest} from '../workspace-db.mjs?v=12';
import {appHarness} from './harness.mjs';
const photo=new Blob([Uint8Array.from([255,216,255,224,0,2,255,217])],{type:'image/jpeg'});
const scene=()=>({selected:['chavalard'],customPeaks:[],globalSettings:{brightness:1.3},gpxSource:{name:'summits.gpx',text:'<gpx/>'},gpxTrack:[{lat:46.1,lon:7.1,ele:null,time:null,segment:0},{lat:46.11,lon:7.11,ele:2900,time:100,segment:0}],narrativePins:[{id:'pin-a',track:'track-a',block:'chavalard',lat:46.1,lon:7.1,image:'photo-test-pin'}],blockSettings:{chavalard:{bookOpenAtStart:true,bookCloseAtEnd:true,bookCoverImage:'photo-test-cover',bookPages:[{chapter:'La montée',title:'Un matin',text:'Départ avant le jour',image:'photo-test-page'}]}},cameraShots:[{type:'book',from:'chavalard',duration:20}]});

test('legacy settings migrate once and newly created projects do not inherit another project',async()=>{
 const first=new ProjectSession();const legacy={selected:['lagginhorn'],globalSettings:{brightness:1.7}};const row=await first.open(null,legacy);assert.equal(row.name,'Mon premier récit');assert.deepEqual(row.snapshot,legacy);
 const next=new ProjectSession();await next.open(row.id,{selected:['chavalard']});assert.deepEqual(next.current.snapshot,legacy);
 const blank=await createProject('Nouveau',{});assert.deepEqual(blank.snapshot,{});assert.deepEqual((await getProject(row.id)).snapshot,legacy);
});

test('project duplication is independent and retains all references and GPX data',async()=>{
 const original=await createProject('Ascension',scene()),dup=await duplicateProject(original);assert.notEqual(original.id,dup.id);const changed=structuredClone(dup.snapshot);changed.blockSettings.chavalard.bookPages[0].text='Une autre version';await updateProject(dup.id,dup.revision,changed);
 assert.equal((await getProject(original.id)).snapshot.blockSettings.chavalard.bookPages[0].text,'Départ avant le jour');assert.deepEqual((await getProject(dup.id)).snapshot.gpxTrack,original.snapshot.gpxTrack);
});

test('portable project includes every media blob, remaps imported IDs and survives round trip',async()=>{
 for(const key of projectMediaIds(scene()))await storeRequest('photos','readwrite',s=>s.put(photo,key));
 const row=await createProject('Voyage complet',scene()),file=await exportProjectFile(row),data=JSON.parse(await file.text());assert.equal(data.media.length,3);
 const imported=await importProjectFile(file);assert.notEqual(imported.id,row.id);assert.deepEqual(imported.snapshot.gpxTrack,row.snapshot.gpxTrack);assert.deepEqual(imported.snapshot.gpxSource,row.snapshot.gpxSource);
 for(const key of projectMediaIds(imported.snapshot)){assert.ok(!projectMediaIds(row.snapshot).includes(key));assert.equal((await storeRequest('photos','readonly',s=>s.get(key))).size,photo.size);}
 assert.equal(imported.snapshot.blockSettings.chavalard.bookPages[0].chapter,'La montée');assert.equal(imported.snapshot.blockSettings.chavalard.bookOpenAtStart,true);
 const repeated=await importProjectFile(file);assert.notEqual(imported.id,repeated.id);
});

test('invalid/missing media imports are atomic and an unknown version leaves projects untouched',async()=>{
 const row=await createProject('Validation',scene()),original=JSON.parse(await (await exportProjectFile(row)).text()),before=(await listProjects()).length;
 for(const mutation of [d=>d.version=99,d=>d.media.pop(),d=>d.media[0].data='garbage!',d=>d.snapshot.gpxTrack[0].lat=500]){const data=structuredClone(original);mutation(data);await assert.rejects(importProjectFile(new Blob([JSON.stringify(data)])));assert.equal((await listProjects()).length,before);}
 assert.throws(()=>validateSnapshot({blockSettings:{bad:{diameter:Infinity}}}));
});

test('two tabs can edit different projects; conflicting writes keep dirty data for recovery',async()=>{
 const row=await createProject('Commun',{}),a=new ProjectSession(),b=new ProjectSession();await a.open(row.id);await b.open(row.id);a.schedule({selected:['chavalard']});await a.flush();b.schedule({selected:['lagginhorn']});await assert.rejects(b.flush(),e=>e.code==='CONFLICT');assert.deepEqual(b.pending.selected,['lagginhorn']);assert.deepEqual((await getProject(row.id)).snapshot.selected,['chavalard']);
 const rescued=await duplicateProject({...b.current,snapshot:b.pending},'Version récupérée');assert.deepEqual(rescued.snapshot.selected,['lagginhorn']);b.pending=null;clearTimeout(b.timer);
 const c=new ProjectSession();await c.open(rescued.id);c.schedule({selected:['barrhorn']});await c.flush();assert.deepEqual((await getProject(row.id)).snapshot.selected,['chavalard']);
});

test('serialized autosaves keep latest edit and acknowledge only committed data',async()=>{
 const row=await createProject('Rafale',{}),session=new ProjectSession();await session.open(row.id);const status=[];session.onStatus=t=>status.push(t);
 session.schedule({globalSettings:{brightness:1}});const first=session.flush();session.schedule({globalSettings:{brightness:1.8}});await session.flush();await first;assert.equal((await getProject(row.id)).snapshot.globalSettings.brightness,1.8);assert.equal(session.pending,null);assert.match(status.at(-1),/Enregistré/);
});

test('app snapshot restores GPX missing altitude, view, playback and chapter settings without reimport',async()=>{
 const saved=scene();saved.playback={duration:45,follow:false,progress:.3};saved.view={position:[3,10,20],target:[0,2,0]};const a=appHarness(saved,{prepareMedia:async()=>{}});assert.equal(a.gpxTrack.length,2);assert.ok(Number.isNaN(a.gpxTrack[0].ele));assert.equal(a.gpxPlayer.duration,45);assert.equal(a.gpxPlayer.follow,false);assert.equal(a.gpxPlayer.progress,.3);assert.equal(a.settingsFor('chavalard').bookPages[0].chapter,'La montée');const snapshot=a.projectSnapshot();assert.equal(snapshot.gpxSource.name,'summits.gpx');assert.equal(snapshot.gpxTrack.length,2);await new Promise(resolve=>setImmediate(resolve));a.dom.window.close();
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
test('set-base preserves identity and external URLs; dry-run and invalid config do not mutate', () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(),'feed-base-'));
 try {
  fs.mkdirSync(path.join(dir,'data'));
  fs.copyFileSync(path.join(__dirname,'feed-generator.cjs'),path.join(dir,'feed-generator.cjs'));
  const base='https://hvhoon.github.io/tars-podcast-feed';
  const rows=[base+'/data/episodes/a.mp3',base+'-other/data/episodes/b.mp3','https://external.test/c.mp3'].map((audioUrl,i)=>({id:'id'+i,title:'title'+i,addedAt:'2026-11-09T10:00:00Z',audioUrl}));
  fs.writeFileSync(path.join(dir,'data/episodes.json'),JSON.stringify(rows));
  fs.writeFileSync(path.join(dir,'feed.config.json'),JSON.stringify({publicBaseUrl:base}));
  const run=(...args)=>execFileSync(process.execPath,[path.join(dir,'feed-generator.cjs'),...args],{stdio:'pipe'});
  run('build'); const before=fs.readFileSync(path.join(dir,'feed.xml'),'utf8');
  run('set-base','--url','https://pulse-podcast.7islands.network','--dry-run');
  assert.equal(fs.readFileSync(path.join(dir,'feed.xml'),'utf8'),before);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'data/episodes.json'))),rows);
  run('set-base','--url','https://pulse-podcast.7islands.network');
  const after=JSON.parse(fs.readFileSync(path.join(dir,'data/episodes.json')));
  assert.deepEqual(after,rows.map((r,i)=>i===0?{...r,audioUrl:'https://pulse-podcast.7islands.network/data/episodes/a.mp3'}:r));
  run('set-base','--url',base); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'data/episodes.json'))),rows);
  for (const value of ['{}','bad',JSON.stringify({publicBaseUrl:base+'/'})]) {
   fs.writeFileSync(path.join(dir,'feed.config.json'),value); assert.throws(()=>run('build'));
  }
  fs.unlinkSync(path.join(dir,'feed.config.json')); assert.throws(()=>run('build'));
 } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

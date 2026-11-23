'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const stats = require('../relationships-stats.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const relationships = fs.readFileSync(path.join(__dirname, '../relationships.js'), 'utf8');

const close = (actual, expected, eps=1e-8) => {
 assert.ok(Number.isFinite(actual), 'Expected finite number, got '+actual);
 assert.ok(Math.abs(actual-expected)<eps, actual+' differs from '+expected);
};
test('Perfect positive, negative, and undefined county Pearson correlation',()=>{
 close(stats.pearson([1,2,3,4],[5,10,15,20]),1);
 close(stats.pearson([1,2,3,4],[10,7,4,1]),-1);
 assert.equal(stats.pearson([1,1,1,1],[0,1,2,3]),null);
});
test('Spearman uses tie-aware average ranks and stays within [-1,1]',()=>{
 assert.deepEqual(stats.ranks([2,2,9,4]),[1.5,1.5,4,3]);
 close(stats.spearman([1,3,3,4],[7,9,9,14]),1);
 assert.ok(stats.spearman([1,2,2,4],[4,1,2,0])<0);
});
test('Unweighted OLS estimates correct slope and explanatory power',()=>{
 const x=Array.from({length:35},(_,i)=>i/3);
 const y=x.map(v=>4+2*v);
 const result=stats.ols(y,[x.map(()=>1),x]);
 assert.ok(result);
 close(result.coefficients[0],4,1e-7);
 close(result.coefficients[1],2,1e-7);
 close(result.r2,1,1e-8);
});
test('Population weighting is deliberate rather than silently applied',()=>{
 const points=[{x:1,y:1,population:10},{x:2,y:3,population:10},
  {x:3,y:2,population:50000},{x:4,y:6,population:10}];
 const a=stats.assess(points);
 assert.ok(Number.isFinite(a.pearson));
 assert.ok(Number.isFinite(a.weightedPearson));
 assert.notEqual(a.pearson,a.weightedPearson);
});
test('Adjusted and interaction models recover varying X slope while controlling moderator',()=>{
 const points=Array.from({length:450},(_,i)=>{
  const x=((i*37)%179-89)/28;
  const income=((i*53)%163-81)/28;
  const y=0.55*x+0.9*income+1.25*x*income+((i*17)%31-15)*.009;
  return {x,y,population:10000+i*13,values:{income}};
 });
 const unadjusted=stats.assess(points);
 const model=stats.adjusted(points,['income'],'income');
 assert.equal(model.n,450);
 assert.ok(model.r2>unadjusted.r2);
 assert.ok(model.interaction.r2>0.995);
 assert.ok(model.interaction.betaXZ>0.5);
 assert.ok(model.interaction.slopeHigh>model.interaction.slopeLow);
 assert.equal(model.groups[0].n+model.groups[1].n,450);
});
test('Partial correlation is null for constant or singular samples, no fake zeroes',()=>{
 assert.equal(stats.pearson([2,2,2],[4,5,6]),null);
 const points=Array.from({length:50},(_,i)=>({
  x:i,y:2*i,population:1000,values:{income:i}
 }));
 const output=stats.adjusted(points,['income'],null);
 assert.ok(output.error); // X and control contain the identical measure.
});
test('Correlation matrix uses independent pairwise complete cases',()=>{
 const points=[
 {values:{college:20,income:40000,self:2}},
 {values:{college:30,income:50000,self:null}},
 {values:{college:40,income:60000,self:4}},
 {values:{college:50,income:70000,self:6}}
 ];
 const matrix=stats.correlationMatrix(points,['college','income','self']);
 assert.equal(matrix[0][1].n,4);
 assert.equal(matrix[1][2].n,3);
 close(matrix[0][1].r,1);
});
test('Relationships tab exposes all three modes and existing map remains present',()=>{
 assert.match(html,/id="cs-tab-relationships"/);
 assert.match(html,/value="scatter"/);
 assert.match(html,/value="map"/);
 assert.match(html,/value="stats"/);
 assert.match(html,/id="county-map-view"/);
 assert.match(html,/id="rel-panel-scatter"/);
 assert.match(html,/id="rel-panel-map"/);
 assert.match(html,/id="rel-panel-stats"/);
 assert.match(app,/CountyRelationships\?\.init/);
 assert.match(app,/CountyRelationships\?\.refresh/);
 assert.match(app,/CountyRelationships\?\.highlightCounty/);
});
test('Every Relationships JS selector ID exists in the shipped HTML',()=>{
 const ids=[...relationships.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
 const missing=[...new Set(ids)].filter(id=>!html.includes('id="'+id+'"'));
 assert.deepEqual(missing,[]);
});
test('SEDA selectors still disabled until source publication is authorized',()=>{
 assert.match(html,/value="seda_achievement" disabled/);
 assert.match(html,/value="seda_math" disabled/);
 assert.match(html,/value="seda_reading" disabled/);
});

test('Public preview explains protected datasets instead of showing empty map as real data',()=>{
 const parks=fs.readFileSync(path.join(__dirname,'../nature.js'),'utf8');
 const trends=fs.readFileSync(path.join(__dirname,'../trends.js'),'utf8');
 assert.match(html,/id="nature-data-unavailable" hidden role="status"/);
 assert.match(html,/id="trend-data-unavailable" hidden role="status"/);
 assert.match(html,/older public CountyScope preview/);
 assert.match(html,/current public URL is not private/);
 assert.match(parks,/\$\('nature-data-unavailable'\)/);
 assert.match(trends,/\$\('trend-data-unavailable'\)/);
 assert.match(parks,/\$\('nature-svg'\)\.hidden=true/);
 assert.match(trends,/\$\('trend-svg'\)\.hidden=true/);
});

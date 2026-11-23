/* CountyScope Relationships: statistical functions (no network, no DOM, no packages).
 * Unweighted county analysis is the default. All models use complete paired cases.
 * Results are descriptive, county-ecological and do not establish causality.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CountyRelationshipStats = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  function mean(a) {
    return a.length ? a.reduce((s,v) => s+v,0)/a.length : null;
  }
  function median(a) {
    if (!a.length) return null;
    const b=a.slice().sort((x,y)=>x-y),m=b.length>>1;
    return b.length%2 ? b[m] : (b[m-1]+b[m])/2;
  }
  function variance(a) {
    const m=mean(a);
    return m==null ? null : a.reduce((s,v)=>s+(v-m)**2,0)/a.length;
  }
  function pearson(a,b, weights) {
    if (a.length!==b.length || a.length<3) return null;
    const w=weights || a.map(()=>1);
    if(w.length!==a.length || a.some((v,i)=>!finite(v)||!finite(b[i])||!finite(w[i])||w[i]<0))return null;
    const W=w.reduce((s,v)=>s+v,0);
    if(W<=0)return null;
    const mx=a.reduce((s,v,i)=>s+v*w[i],0)/W, my=b.reduce((s,v,i)=>s+v*w[i],0)/W;
    let xx=0,yy=0,xy=0;
    for(let i=0;i<a.length;i++){
      const dx=a[i]-mx,dy=b[i]-my;
      xx+=w[i]*dx*dx;yy+=w[i]*dy*dy;xy+=w[i]*dx*dy;
    }
    if(xx<=1e-12 || yy<=1e-12)return null;
    return Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)));
  }
  function ranks(a) {
    const indexed=a.map((v,i)=>({v,i})).sort((x,y)=>x.v-y.v);
    const result=Array(a.length);
    for(let start=0;start<indexed.length;){
      let end=start+1;
      while(end<indexed.length && indexed[end].v===indexed[start].v)end++;
      const rank=(start+end+1)/2; // Average 1-indexed rank among ties
      for(let i=start;i<end;i++)result[indexed[i].i]=rank;
      start=end;
    }
    return result;
  }
  function spearman(a,b) {
    return a.length!==b.length ? null : pearson(ranks(a),ranks(b));
  }
  function solve(a,b) {
    const n=b.length, A=a.map((row,i)=>row.slice().concat(b[i]));
    for(let j=0;j<n;j++){
      let pivot=j;
      for(let i=j+1;i<n;i++)if(Math.abs(A[i][j])>Math.abs(A[pivot][j]))pivot=i;
      if(!finite(A[pivot][j]) || Math.abs(A[pivot][j])<1e-9)return null;
      [A[j],A[pivot]]=[A[pivot],A[j]];
      const d=A[j][j];
      for(let k=j;k<=n;k++)A[j][k]/=d;
      for(let i=0;i<n;i++){
        if(i===j)continue;
        const f=A[i][j];
        for(let k=j;k<=n;k++)A[i][k]-=f*A[j][k];
      }
    }
    return A.map(row=>row[n]);
  }
  function ols(y, columns) {
    if(!columns.length || y.length<columns.length+8)return null;
    if(columns.some(col=>col.length!==y.length))return null;
    const k=columns.length;
    const A=Array.from({length:k},()=>Array(k).fill(0)), B=Array(k).fill(0);
    for(let i=0;i<y.length;i++){
      if(!finite(y[i])||columns.some(col=>!finite(col[i])))return null;
      for(let j=0;j<k;j++){
        B[j]+=columns[j][i]*y[i];
        for(let l=0;l<k;l++)A[j][l]+=columns[j][i]*columns[l][i];
      }
    }
    const coefficients=solve(A,B);
    if(!coefficients)return null;
    const avg=mean(y),sst=y.reduce((s,v)=>s+(v-avg)**2,0);
    if(sst<=1e-12)return null;
    let sse=0;
    for(let i=0;i<y.length;i++){
      const estimate=coefficients.reduce((s,b,j)=>s+b*columns[j][i],0);
      sse+=(y[i]-estimate)**2;
    }
    return {coefficients,r2:Math.min(1,Math.max(0,1-sse/sst)),n:y.length};
  }
  function standardize(a) {
    const m=mean(a), sd=Math.sqrt(variance(a)||0);
    return sd<=1e-12 ? null : {values:a.map(v=>(v-m)/sd),mean:m,sd};
  }
  function paired(records, xKey, yKey, minPop=0) {
    return records.filter(r=>
      finite(r.x) && finite(r.y) && finite(r.population) && r.population>=minPop &&
      r.xKey===xKey && r.yKey===yKey
    );
  }
  function assess(points) {
    const x=points.map(p=>p.x), y=points.map(p=>p.y),
          w=points.map(p=>p.population);
    const r=pearson(x,y),rs=spearman(x,y),rw=pearson(x,y,w);
    const linear=ols(y,[x.map(()=>1),x]);
    return {n:points.length,pearson:r,spearman:rs,weightedPearson:rw,
            slope:linear?.coefficients[1]??null,
            intercept:linear?.coefficients[0]??null,
            r2:linear?.r2??null,
            medianX:median(x),medianY:median(y)};
  }
  function adjusted(points, controls=[], moderator=null) {
    // Refit on one complete-case sample. Standardize continuous terms to
    // make raw income / large-population regressors numerically stable.
    const controlKeys=[...new Set(controls.filter(Boolean))];
    const keys=[...new Set([...controlKeys,...(moderator?[moderator]:[])])];
    const data=points.filter(p=>keys.every(key=>finite(p.values[key])));
    const x=data.map(p=>p.x), y=data.map(p=>p.y);
    if(data.length<Math.max(35,keys.length*12+20))return {n:data.length,error:'Not enough complete counties'};
    const X=standardize(x),Y=standardize(y);
    if(!X||!Y)return {n:data.length,error:'The selected measure has no variation'};
    const colMap={};
    for(const key of keys){
      const z=standardize(data.map(p=>p.values[key]));
      if(!z)return {n:data.length,error:'A control or interaction measure has no variation'};
      colMap[key]=z.values;
    }
    const ones=Array(data.length).fill(1);
    // The moderator enters as a main effect in both the adjusted and interaction
    // models, even when it is not also selected in a regular control dropdown.
    const adjustmentKeys=keys;
    const controlCols=adjustmentKeys.map(k=>colMap[k]);
    const model=ols(Y.values,[ones,X.values,...controlCols]);
    if(!model)return {n:data.length,error:'Controls are redundant or the model is singular'};
    const rx=ols(X.values,[ones,...controlCols]),ry=ols(Y.values,[ones,...controlCols]);
    const rPartial=rx&&ry?pearson(
      X.values.map((v,i)=>v-rx.coefficients.reduce((s,b,j)=>s+b*[ones,...controlCols][j][i],0)),
      Y.values.map((v,i)=>v-ry.coefficients.reduce((s,b,j)=>s+b*[ones,...controlCols][j][i],0))
    ):null;
    const output={n:data.length,r2:model.r2,beta:model.coefficients[1],partial:rPartial,controls:adjustmentKeys};
    if(moderator){
      // Moderator is included in the interaction model; if it was also chosen
      // as a control, it is only included once to avoid rank deficiency.
      const Z=colMap[moderator];
      const product=X.values.map((v,i)=>v*Z[i]);
      const interactionControlCols=controlKeys.filter(k=>k!==moderator).map(k=>colMap[k]);
      const fit=ols(Y.values,[ones,X.values,...interactionControlCols,Z,product]);
      if(fit){
        output.interaction={
          n:data.length,betaXZ:fit.coefficients[fit.coefficients.length-1],
          slopeLow:fit.coefficients[1]-fit.coefficients[fit.coefficients.length-1],
          slopeHigh:fit.coefficients[1]+fit.coefficients[fit.coefficients.length-1],
          r2:fit.r2
        };
      }
      const m=median(data.map(p=>p.values[moderator]));
      const lower=data.filter(p=>p.values[moderator]<m),
            upper=data.filter(p=>p.values[moderator]>=m);
      output.groups=[
        {name:'Below median',n:lower.length,r:pearson(lower.map(p=>p.x),lower.map(p=>p.y))},
        {name:'At/above median',n:upper.length,r:pearson(upper.map(p=>p.x),upper.map(p=>p.y))}
      ];
    }
    return output;
  }
  function correlationMatrix(points, keys) {
    const unique=[...new Set(keys.filter(Boolean))].slice(0,6);
    return unique.map((a,i)=>unique.map((b,j)=>{
      const paired=points.filter(p=>finite(p.values[a])&&finite(p.values[b]));
      const xs=paired.map(p=>p.values[a]),ys=paired.map(p=>p.values[b]);
      return {n:paired.length,r:i===j?(variance(xs)>1e-12?1:null):pearson(xs,ys)};
    }));
  }
  return {mean,median,variance,pearson,ranks,spearman,ols,standardize,assess,adjusted,correlationMatrix,paired};
});

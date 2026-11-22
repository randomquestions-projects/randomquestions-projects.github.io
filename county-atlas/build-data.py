#!/usr/bin/env python3
"""Create public county-level aggregates from official NCES, USRC and Census data.

Rejects inconsistent sources rather than shipping plausible but inaccurate maps.
No raw school or worship directories are committed to the public site.
"""
import io, json, re
from pathlib import Path
import requests
import openpyxl
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USRC="https://www.usreligioncensus.org/sites/default/files/2023-06/2020_USRC_Summaries.xlsx"
SCHOOL={
"public":"https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Public_School_Locations_Current/FeatureServer/0/query",
"private":"https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Private_School_Locations_Current/FeatureServer/0/query"}
CENSUS="https://api.census.gov/data/2020/dec/pl"
OUT=Path(__file__).parent/"data"/"county-counts.json"
EXCLUDE={"60","66","69","72","78"}

def session():
 s=requests.Session()
 s.mount("https://",HTTPAdapter(max_retries=Retry(total=4,backoff_factor=2,status_forcelist=[429,500,502,503,504])))
 s.headers.update({"User-Agent":"CountyScope/1.0 (Public data research; https://randomquestions-projects.github.io/county-atlas/)"})
 return s

def number(v):
 if v is None or isinstance(v,bool):return None
 try:return float(str(v).replace(",","").strip())
 except ValueError:return None

def fips(v):
 if v is None:return None
 if isinstance(v,(int,float)):
  if not 1<=v<=99999 or int(v)!=v:return None
  return str(int(v)).zfill(5)
 t=str(v).strip()
 if t.endswith(".0"):t=t[:-2]
 return t.zfill(5) if re.fullmatch(r"\d{1,5}",t) else None

def key(v):return re.sub("[^a-z0-9]","",str(v or "").lower())

def religion(s):
 print("USRC: downloading official Excel summary",flush=True)
 r=s.get(USRC,timeout=180);r.raise_for_status()
 if len(r.content)<30000 or not r.content.startswith(b"PK"):raise ValueError("USRC did not return an XLSX")
 wb=openpyxl.load_workbook(io.BytesIO(r.content),read_only=True,data_only=True)
 candidates=[]
 for ws in wb:
  for ix,headers in enumerate(ws.iter_rows(min_row=1,max_row=40,values_only=True),1):
   keys=[key(x) for x in headers]
   pick=lambda candidates: next((i for i,k in enumerate(keys) if k in candidates),None)
   a=pick({"fips","countyfips","countyfipscode","fipscode","countycode"})
   b=pick({"congregations","totalcongregations","numberofcongregations","congregationstotal","totalnumberofcongregations"})
   if a is None or b is None:continue
   found={};duplicate=False
   for line in ws.iter_rows(min_row=ix+1,values_only=True):
    fid=fips(line[a] if len(line)>a else None)
    if not fid or fid[:2] in EXCLUDE:continue
    n=number(line[b] if len(line)>b else None)
    if n is None or n<0 or n!=int(n):continue
    if fid in found:duplicate=True;break
    found[fid]=int(n)
   if not duplicate and 3000<=len(found)<=3300:
    candidates.append((ws.title,found))
   break
 wb.close()
 if not candidates:raise ValueError("USRC county workbook structure unknown; refusing to publish")
 candidates.sort(key=lambda x:abs(sum(x[1].values())-356642))
 name,rows=candidates[0];total=sum(rows.values())
 if not 350000<=total<=365000:raise ValueError("USRC congregation total failed validation "+str(total))
 print("USRC:",name,len(rows),"counties",total,"congregations",flush=True)
 return rows

def schools(s,kind):
 url=SCHOOL[kind];counts={};offset=0
 while True:
  p={"f":"json","where":"1=1","outFields":"CNTY","returnGeometry":"false",
     "groupByFieldsForStatistics":"STFIP,CNTY","orderByFields":"STFIP,CNTY",
     "outStatistics":json.dumps([{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"n"}]),
     "resultOffset":offset,"resultRecordCount":2000}
  r=s.get(url,params=p,timeout=90);r.raise_for_status();data=r.json()
  if "error" in data:raise ValueError("NCES "+kind+": "+str(data["error"]))
  features=data.get("features")
  if not isinstance(features,list):raise ValueError("Missing NCES feature results")
  for feat in features:
   a=feat.get("attributes") or {};county=str(a.get("CNTY") or "").strip();state=str(a.get("STFIP") or "").strip();fid=fips(state.zfill(2)+county.zfill(3)) if (county.isdigit() and len(county)<=3 and state.isdigit()) else fips(county);n=number(a.get("n"))
   if fid and fid[:2] not in EXCLUDE and n is not None:
    if fid in counts:raise ValueError("Duplicate NCES county on pagination")
    counts[fid]=int(n)
  offset+=len(features)
  if len(features)<2000:break
  if offset>5000:raise ValueError("Unexpected NCES pagination")
 total=sum(counts.values())
 lo,hi=(85000,140000) if kind=="public" else (12000,35000)
 if len(counts)<2800 or not lo<=total<=hi:raise ValueError("Invalid nationwide NCES "+kind+" totals: "+str((len(counts),total)))
 print("NCES",kind,":",len(counts),"counties",total,"schools",flush=True)
 return counts

def population(s):
 r=s.get(CENSUS,params={"get":"NAME,P1_001N","for":"county:*"},timeout=90);r.raise_for_status()
 table=r.json();h=table[0];p=h.index("P1_001N");st=h.index("state");co=h.index("county")
 rows={}
 for x in table[1:]:
  fid=str(x[st]).zfill(2)+str(x[co]).zfill(3)
  if fid[:2] not in EXCLUDE:rows[fid]=int(x[p])
 if len(rows)<3100:raise ValueError("Incomplete Census county denominators: "+str(len(rows)))
 print("Census population:",len(rows),"counties",flush=True)
 return rows

def build():
 s=session();religion_count=religion(s)
 public=schools(s,"public");private=schools(s,"private");pop=population(s)
 # Null congregations means not reported; zero school locations is a real zero
 # only after a complete nationwide NCES query passed coverage checks.
 data=[{"fips":k,"churches":religion_count.get(k),"public":public.get(k,0),
        "private":private.get(k,0),"population":pop[k]} for k in sorted(pop)]
 output={"version":1,"source_years":{"churches":2020,"public":"2024-25","private":"2023-24","population":2020},
         "source_urls":{"churches":USRC,"public":SCHOOL["public"],"private":SCHOOL["private"],"population":CENSUS},
         "counties":data}
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(output,separators=(",",":"))+"\n",encoding="utf-8")
 print("Wrote",len(data),"county aggregates to",OUT,flush=True)

if __name__=="__main__":build()

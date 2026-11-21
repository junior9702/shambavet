import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, BriefcaseBusiness, CalendarClock, CheckCircle2, CloudSun,
  MessageSquareText, RefreshCw, Send, ShieldCheck, Stethoscope,
  TrendingUp, MapPin, Clock3, ExternalLink
} from "lucide-react";
import {
  addDoc, collection, limit, onSnapshot, query, serverTimestamp,
  updateDoc, doc, where
} from "firebase/firestore";
import { db } from "./firebase";
import "./expansion.css";

const COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay",
  "Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii",
  "Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera",
  "Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi",
  "Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta",
  "Tana River","Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga",
  "Wajir","West Pokot"
];

const TABS = [
  ["weather","County weather",CloudSun],
  ["appointments","Vet appointments",Stethoscope],
  ["community","Farmer community",MessageSquareText],
  ["opportunities","Jobs & opportunities",BriefcaseBusiness],
  ["markets","Market information",TrendingUp]
];

const dateLabel = value => {
  if (!value) return "Date not supplied";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not supplied" : date.toLocaleDateString("en-KE",{day:"numeric",month:"short",year:"numeric"});
};
const sortNewest = rows => [...rows].sort((a,b) => {
  const av = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
  const bv = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
  return bv-av;
});
const weatherLabel = code => ({
  0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Depositing rime fog",
  51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",
  71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Rain showers",82:"Heavy showers",
  95:"Thunderstorm",96:"Thunderstorm with hail",99:"Severe thunderstorm"
}[code] || "Variable conditions");

function Notice({kind="info",children}) {
  return <div className={"svx-notice "+kind}>{children}</div>;
}

function WeatherPanel() {
  const [county,setCounty] = useState("Nairobi");
  const [weather,setWeather] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [updated,setUpdated] = useState(null);

  const load = async (signal) => {
    setBusy(true); setError(""); setWeather(null);
    try {
      const geoResponse = await fetch("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(county)+"&count=10&language=en&format=json&countryCode=KE",{signal});
      if (!geoResponse.ok) throw new Error("County location lookup is temporarily unavailable.");
      const geo = await geoResponse.json();
      const place = (geo.results || []).find(x => x.country_code === "KE") || geo.results?.[0];
      if (!place) throw new Error("A forecast location could not be found for "+county+". Try another county.");
      const url = "https://api.open-meteo.com/v1/forecast?latitude="+encodeURIComponent(place.latitude)+"&longitude="+encodeURIComponent(place.longitude)+"&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Africa%2FNairobi&forecast_days=5";
      const response = await fetch(url,{signal});
      if (!response.ok) throw new Error("Weather data is temporarily unavailable.");
      const data = await response.json();
      setWeather({...data,placeName:place.name,admin1:place.admin1||county});
      setUpdated(new Date());
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || "Weather could not be loaded.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  },[county]);

  return <section className="svx-panel">
    <div className="svx-panelHead"><div><span className="svx-eyebrow">LOCAL CONDITIONS</span><h2>County weather outlook</h2><p>Forecast for a representative location in the selected county, not a farm-specific measurement.</p></div><CloudSun size={28}/></div>
    <div className="svx-toolbar"><label>County<select value={county} onChange={e=>setCounty(e.target.value)}>{COUNTIES.map(x=><option key={x}>{x}</option>)}</select></label><button type="button" onClick={()=>load()} disabled={busy}><RefreshCw size={15}/>{busy?"Loading…":"Refresh forecast"}</button></div>
    {error&&<Notice kind="warning"><AlertCircle size={17}/>{error}</Notice>}
    {busy&&!weather&&<div className="svx-empty">Loading county forecast…</div>}
    {weather&&<>
      <div className="svx-weatherCurrent"><div><span className="svx-muted">{weather.placeName}, {weather.admin1}</span><div className="svx-temp">{Math.round(weather.current.temperature_2m)}°C</div><b>{weatherLabel(weather.current.weather_code)}</b></div><div className="svx-weatherMetrics"><div><span>Feels like</span><b>{Math.round(weather.current.apparent_temperature)}°C</b></div><div><span>Humidity</span><b>{weather.current.relative_humidity_2m}%</b></div><div><span>Rain now</span><b>{weather.current.precipitation} mm</b></div><div><span>Wind</span><b>{weather.current.wind_speed_10m} km/h</b></div></div></div>
      <div className="svx-forecastGrid">{(weather.daily?.time||[]).map((day,i)=><article className="svx-forecastDay" key={day}><b>{new Date(day+"T12:00:00").toLocaleDateString("en-KE",{weekday:"short"})}</b><span>{weatherLabel(weather.daily.weather_code[i])}</span><strong>{Math.round(weather.daily.temperature_2m_max[i])}° / {Math.round(weather.daily.temperature_2m_min[i])}°</strong><small>Rain chance: {weather.daily.precipitation_probability_max?.[i] ?? "—"}%</small></article>)}</div>
      <div className="svx-source">Source: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · Updated {updated?.toLocaleTimeString("en-KE",{hour:"2-digit",minute:"2-digit"})}. Forecasts are estimates; check local conditions before farm operations.</div>
    </>}
  </section>;
}

function Appointments({authUser,vets}) {
  const [form,setForm] = useState({veterinarianId:"",farmerName:"",phone:"",county:"",subCounty:"",animal:"",reason:"",preferredDate:"",preferredTime:""});
  const [mine,setMine] = useState([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  useEffect(()=>{
    if (!authUser?.uid) { setMine([]); return; }
    return onSnapshot(query(collection(db,"vetAppointmentRequests"),where("ownerUid","==",authUser.uid),limit(50)),snap=>setMine(sortNewest(snap.docs.map(d=>({id:d.id,...d.data()})))),e=>setMessage("Your appointment requests could not load: "+e.message));
  },[authUser?.uid]);
  const submit = async () => {
    if (!authUser?.uid) return setMessage("Please wait for your secure ShambaVet session.");
    if (!form.farmerName.trim()||!form.phone.trim()||!form.county||!form.animal.trim()||!form.reason.trim()) return setMessage("Complete your name, phone, county, animal and reason for consultation.");
    if (form.reason.trim().length < 15) return setMessage("Please describe the concern in at least 15 characters.");
    setBusy(true);setMessage("");
    try {
      const vet=vets.find(x=>x.id===form.veterinarianId);
      await addDoc(collection(db,"vetAppointmentRequests"),{
        ...form,farmerName:form.farmerName.trim(),phone:form.phone.trim(),reason:form.reason.trim(),
        veterinarianName:vet?.name||"First available veterinarian",ownerUid:authUser.uid,
        status:"pending",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      setForm(x=>({...x,reason:"",preferredDate:"",preferredTime:""}));
      setMessage("Request submitted. It is not a confirmed appointment; the ShambaVet team must contact you to confirm availability.");
    } catch(e) { setMessage("Could not submit your request: "+e.message); }
    finally { setBusy(false); }
  };
  return <section className="svx-panel">
    <div className="svx-panelHead"><div><span className="svx-eyebrow">CONNECT TO A PROFESSIONAL</span><h2>Request a veterinary consultation</h2><p>Send a request to the ShambaVet team. A request is not a confirmed booking until availability is checked and confirmed.</p></div><Stethoscope size={28}/></div>
    {!authUser?.uid&&<Notice kind="warning">Sign in to submit and track consultation requests.</Notice>}
    <div className="svx-formGrid">
      <label>Your full name<input value={form.farmerName} onChange={e=>setForm({...form,farmerName:e.target.value})} placeholder="Full name"/></label>
      <label>Phone number<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="07xx xxx xxx" inputMode="tel"/></label>
      <label>County<select value={form.county} onChange={e=>setForm({...form,county:e.target.value})}><option value="">Select county</option>{COUNTIES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Sub-county / town<input value={form.subCounty} onChange={e=>setForm({...form,subCounty:e.target.value})} placeholder="Optional"/></label>
      <label>Animal / species<input value={form.animal} onChange={e=>setForm({...form,animal:e.target.value})} placeholder="e.g. Dairy cow, goat, poultry"/></label>
      <label>Preferred veterinarian<select value={form.veterinarianId} onChange={e=>setForm({...form,veterinarianId:e.target.value})}><option value="">First available veterinarian</option>{vets.map(v=><option key={v.id} value={v.id}>{v.name} · {v.county||v.address||"Kenya"}</option>)}</select></label>
      <label>Preferred date (optional)<input type="date" min={new Date().toISOString().slice(0,10)} value={form.preferredDate} onChange={e=>setForm({...form,preferredDate:e.target.value})}/></label>
      <label>Preferred time (optional)<select value={form.preferredTime} onChange={e=>setForm({...form,preferredTime:e.target.value})}><option value="">Flexible</option><option>Morning</option><option>Afternoon</option><option>Evening</option></select></label>
    </div>
    <label className="svx-blockLabel">Describe the concern<textarea rows="4" maxLength={1500} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="Describe symptoms, how long the animal has been affected, and any urgent signs."/></label>
    <button className="svx-primary" onClick={submit} disabled={busy||!authUser?.uid}><Send size={16}/>{busy?"Submitting…":"Submit consultation request"}</button>
    {message&&<Notice kind="info">{message}</Notice>}
    <div className="svx-subhead"><h3>Your requests</h3><span>{mine.length} submitted</span></div>
    {mine.length?mine.map(x=><article className="svx-listCard" key={x.id}><div><b>{x.veterinarianName||"Veterinarian request"} · {x.animal}</b><p>{x.reason}</p><small>{x.county} · Submitted {dateLabel(x.createdAt)}{x.preferredDate?" · Preferred "+x.preferredDate:""}</small></div><span className={"svx-status "+x.status}>{x.status}</span></article>):<div className="svx-empty">Your submitted consultation requests will appear here.</div>}
  </section>;
}

function Community({authUser}) {
  const [posts,setPosts] = useState([]);
  const [mine,setMine] = useState([]);
  const [form,setForm] = useState({title:"",category:"Livestock",county:"",body:""});
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  useEffect(()=>onSnapshot(query(collection(db,"communityPosts"),where("status","==","published"),limit(60)),s=>setPosts(sortNewest(s.docs.map(d=>({id:d.id,...d.data()})))),e=>setMessage("Community feed unavailable: "+e.message)),[]);
  useEffect(()=>{
    if(!authUser?.uid){setMine([]);return}
    return onSnapshot(query(collection(db,"communityPosts"),where("ownerUid","==",authUser.uid),limit(40)),s=>setMine(sortNewest(s.docs.map(d=>({id:d.id,...d.data()})))),e=>setMessage("Your community submissions could not load: "+e.message));
  },[authUser?.uid]);
  const submit=async()=>{
    if(!authUser?.uid)return setMessage("Sign in to contribute to the farmer community.");
    if(!form.title.trim()||!form.county||form.body.trim().length<20)return setMessage("Enter a title, county and a post of at least 20 characters.");
    setBusy(true);setMessage("");
    try{await addDoc(collection(db,"communityPosts"),{...form,title:form.title.trim(),body:form.body.trim(),ownerUid:authUser.uid,status:"pending",createdAt:serverTimestamp()});setForm({title:"",category:"Livestock",county:"",body:""});setMessage("Your post was submitted for review. It will appear publicly after moderation.");}
    catch(e){setMessage("Could not submit your post: "+e.message)}finally{setBusy(false)}
  };
  return <section className="svx-panel">
    <div className="svx-panelHead"><div><span className="svx-eyebrow">LEARN FROM OTHER FARMERS</span><h2>Farmer community</h2><p>Share practical questions and experience. Posts are reviewed before appearing publicly.</p></div><MessageSquareText size={28}/></div>
    <div className="svx-formGrid"><label>Post title<input value={form.title} maxLength={120} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What would you like to discuss?"/></label><label>Topic<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{["Livestock","Crop production","Poultry","Agribusiness","Farm inputs","Training","Other"].map(x=><option key={x}>{x}</option>)}</select></label><label>County<select value={form.county} onChange={e=>setForm({...form,county:e.target.value})}><option value="">Select county</option>{COUNTIES.map(x=><option key={x}>{x}</option>)}</select></label></div>
    <label className="svx-blockLabel">Your question or experience<textarea rows="4" maxLength={3000} value={form.body} onChange={e=>setForm({...form,body:e.target.value})} placeholder="Describe what happened, what you tried and what advice would help."/></label>
    <button className="svx-primary" onClick={submit} disabled={busy||!authUser?.uid}><Send size={16}/>{busy?"Submitting…":"Submit for community review"}</button>
    {message&&<Notice>{message}</Notice>}
    <div className="svx-subhead"><h3>Community discussions</h3><span>{posts.length} published</span></div>
    {posts.length?posts.map(p=><article className="svx-post" key={p.id}><div className="svx-postMeta"><span>{p.category}</span><span><MapPin size={13}/>{p.county}</span><span>{dateLabel(p.createdAt)}</span></div><h3>{p.title}</h3><p>{p.body}</p><small>Shared by a ShambaVet community member</small></article>):<div className="svx-empty">No published discussions yet. Be among the first to contribute.</div>}
    {mine.some(x=>x.status==="pending")&&<div className="svx-ownPending"><b>Your posts awaiting review</b>{mine.filter(x=>x.status==="pending").map(x=><p key={x.id}>{x.title} · Pending moderation</p>)}</div>}
  </section>;
}

function Opportunities({authUser}) {
  const [items,setItems]=useState([]);
  const [mine,setMine]=useState([]);
  const [form,setForm]=useState({title:"",type:"Job",county:"",organisation:"",deadline:"",contact:"",description:""});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>onSnapshot(query(collection(db,"agriculturalOpportunities"),where("status","==","published"),limit(80)),s=>setItems(sortNewest(s.docs.map(d=>({id:d.id,...d.data()})))),e=>setMessage("Opportunities could not load: "+e.message)),[]);
  useEffect(()=>{if(!authUser?.uid){setMine([]);return}return onSnapshot(query(collection(db,"agriculturalOpportunities"),where("ownerUid","==",authUser.uid),limit(40)),s=>setMine(sortNewest(s.docs.map(d=>({id:d.id,...d.data()})))),e=>setMessage("Your submissions could not load: "+e.message))},[authUser?.uid]);
  const submit=async()=>{
    if(!authUser?.uid)return setMessage("Sign in to submit an opportunity.");
    if(!form.title.trim()||!form.type||!form.county||!form.contact.trim()||form.description.trim().length<20)return setMessage("Complete the title, type, county, contact and description.");
    setBusy(true);setMessage("");
    try{await addDoc(collection(db,"agriculturalOpportunities"),{...form,title:form.title.trim(),organisation:form.organisation.trim(),contact:form.contact.trim(),description:form.description.trim(),ownerUid:authUser.uid,status:"pending",createdAt:serverTimestamp()});setForm({title:"",type:"Job",county:"",organisation:"",deadline:"",contact:"",description:""});setMessage("Opportunity submitted for verification. It will be listed after administrator approval.");}
    catch(e){setMessage("Could not submit opportunity: "+e.message)}finally{setBusy(false)}
  };
  return <section className="svx-panel">
    <div className="svx-panelHead"><div><span className="svx-eyebrow">AGRICULTURAL CAREERS & GROWTH</span><h2>Jobs and opportunities</h2><p>Find agricultural jobs, internships, training, tenders, grants and partnerships. Listings are moderated.</p></div><BriefcaseBusiness size={28}/></div>
    <div className="svx-opportunityList">{items.length?items.map(x=><article className="svx-opportunity" key={x.id}><div className="svx-postMeta"><span>{x.type}</span><span><MapPin size={13}/>{x.county}</span>{x.deadline&&<span><Clock3 size={13}/>Deadline {x.deadline}</span>}</div><h3>{x.title}</h3>{x.organisation&&<b>{x.organisation}</b>}<p>{x.description}</p><div className="svx-opportunityFoot"><span>Contact: {x.contact}</span><small>Published {dateLabel(x.reviewedAt||x.createdAt)}</small></div></article>):<div className="svx-empty">No verified opportunities are listed yet. Check again later.</div>}</div>
    <div className="svx-divider"/>
    <h3>Submit an opportunity</h3><p className="svx-muted">Employers and organisations can submit listings. ShambaVet reviews submissions before publication.</p>
    <div className="svx-formGrid"><label>Opportunity title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Agricultural extension intern"/></label><label>Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{["Job","Internship","Scholarship","Grant","Tender","Training","Partnership"].map(x=><option key={x}>{x}</option>)}</select></label><label>County<select value={form.county} onChange={e=>setForm({...form,county:e.target.value})}><option value="">Select county</option>{COUNTIES.map(x=><option key={x}>{x}</option>)}</select></label><label>Organisation<input value={form.organisation} onChange={e=>setForm({...form,organisation:e.target.value})} placeholder="Organisation / employer"/></label><label>Application deadline<input type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></label><label>Public contact<input value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})} placeholder="Email, phone or application link"/></label></div>
    <label className="svx-blockLabel">Description and application instructions<textarea rows="4" maxLength={2500} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Include eligibility, responsibilities, requirements and how to apply."/></label>
    <button className="svx-primary" onClick={submit} disabled={busy||!authUser?.uid}><Send size={16}/>{busy?"Submitting…":"Submit listing for review"}</button>
    {message&&<Notice>{message}</Notice>}
    {mine.some(x=>x.status==="pending")&&<div className="svx-ownPending"><b>Your pending listings</b>{mine.filter(x=>x.status==="pending").map(x=><p key={x.id}>{x.title} · Awaiting review</p>)}</div>}
  </section>;
}

function MarketInformation({authUser}) {
  const [items,setItems]=useState([]),[mine,setMine]=useState([]);
  const [form,setForm]=useState({commodity:"Maize",county:"",market:"",price:"",unit:"90 kg bag",observedDate:new Date().toISOString().slice(0,10),notes:""});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>onSnapshot(query(collection(db,"marketPriceReports"),where("status","==","published"),limit(100)),s=>setItems(sortNewest(s.docs.map(d=>({id:d.id,...d.data()})))),e=>setMessage("Market information could not load: "+e.message)),[]);
  useEffect(()=>{if(!authUser?.uid){setMine([]);return}return onSnapshot(query(collection(db,"marketPriceReports"),where("ownerUid","==",authUser.uid),limit(40)),s=>setMine(sortNewest(s.docs.map(d=>({id:d.id,...d.data()})))),e=>setMessage("Your price reports could not load: "+e.message))},[authUser?.uid]);
  const submit=async()=>{
    if(!authUser?.uid)return setMessage("Sign in to submit a market observation.");
    if(!form.county||!form.market.trim()||!form.price||Number(form.price)<=0||!form.observedDate)return setMessage("Enter the county, market, valid price and observation date.");
    if(form.observedDate>new Date().toISOString().slice(0,10))return setMessage("The observation date cannot be in the future.");
    setBusy(true);setMessage("");
    try{await addDoc(collection(db,"marketPriceReports"),{...form,price:Number(form.price),market:form.market.trim(),notes:form.notes.trim(),ownerUid:authUser.uid,status:"pending",createdAt:serverTimestamp()});setForm(x=>({...x,market:"",price:"",notes:""}));setMessage("Your market observation was submitted for review. It will be labelled as community-reported when published.");}
    catch(e){setMessage("Could not submit report: "+e.message)}finally{setBusy(false)}
  };
  const money=n=>"KSh "+Number(n||0).toLocaleString("en-KE",{maximumFractionDigits:2});
  return <section className="svx-panel">
    <div className="svx-panelHead"><div><span className="svx-eyebrow">COMMUNITY MARKET OBSERVATIONS</span><h2>Market information</h2><p>See recent farmer-reported prices. These are indicative observations, not official market quotations or guaranteed selling prices.</p></div><TrendingUp size={28}/></div>
    <Notice kind="warning">Always confirm current prices, quality requirements, transport costs and buyer terms directly before making a sale or purchase.</Notice>
    <div className="svx-priceList">{items.length?items.map(x=><article className="svx-priceCard" key={x.id}><div><b>{x.commodity}</b><span>{x.market} · {x.county}</span><small>Observed {dateLabel(x.observedDate)} · Community reported</small></div><strong>{money(x.price)} <small>/ {x.unit}</small></strong></article>):<div className="svx-empty">No reviewed market observations yet.</div>}</div>
    <div className="svx-divider"/>
    <h3>Share a local market observation</h3>
    <div className="svx-formGrid"><label>Commodity<input value={form.commodity} onChange={e=>setForm({...form,commodity:e.target.value})} placeholder="e.g. Tomatoes, milk, maize"/></label><label>County<select value={form.county} onChange={e=>setForm({...form,county:e.target.value})}><option value="">Select county</option>{COUNTIES.map(x=><option key={x}>{x}</option>)}</select></label><label>Market / town<input value={form.market} onChange={e=>setForm({...form,market:e.target.value})} placeholder="Market name or town"/></label><label>Price (KSh)<input type="number" min="0.01" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Unit<select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}>{["90 kg bag","50 kg bag","20 litre jerrycan","kg","litre","crate","piece","bunch","tonne","other"].map(x=><option key={x}>{x}</option>)}</select></label><label>Observation date<input type="date" max={new Date().toISOString().slice(0,10)} value={form.observedDate} onChange={e=>setForm({...form,observedDate:e.target.value})}/></label></div>
    <label className="svx-blockLabel">Notes (optional)<textarea rows="2" maxLength="500" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Quality, grade, quantity or other useful context."/></label>
    <button className="svx-primary" onClick={submit} disabled={busy||!authUser?.uid}><Send size={16}/>{busy?"Submitting…":"Submit market observation"}</button>
    {message&&<Notice>{message}</Notice>}
    {mine.some(x=>x.status==="pending")&&<div className="svx-ownPending"><b>Your observations awaiting review</b>{mine.filter(x=>x.status==="pending").map(x=><p key={x.id}>{x.commodity} · {x.market} · Pending</p>)}</div>}
  </section>;
}

function ModerationAdmin() {
  const [queues,setQueues]=useState({appointments:[],community:[],opportunities:[],markets:[]});
  const [tab,setTab]=useState("appointments"),[message,setMessage]=useState(""),[busyId,setBusyId]=useState("");
  useEffect(()=>{
    const specs=[["appointments","vetAppointmentRequests"],["community","communityPosts"],["opportunities","agriculturalOpportunities"],["markets","marketPriceReports"]];
    const unsub=specs.map(([key,name])=>onSnapshot(query(collection(db,name),where("status","==","pending"),limit(100)),s=>setQueues(prev=>({...prev,[key]:sortNewest(s.docs.map(d=>({id:d.id,...d.data()})))})),e=>setMessage("Moderation queue error: "+e.message)));
    return()=>unsub.forEach(fn=>fn());
  },[]);
  const change=async(collectionName,item,status)=>{
    setBusyId(item.id);setMessage("");
    try{await updateDoc(doc(db,collectionName,item.id),{status,reviewedAt:serverTimestamp(),reviewedBy:"platform-admin",updatedAt:serverTimestamp()});setMessage("Record updated: "+status+".")}
    catch(e){setMessage("Could not update this record: "+e.message)}
    finally{setBusyId("")}
  };
  const config={
    appointments:{name:"Veterinary requests",collection:"vetAppointmentRequests",items:queues.appointments},
    community:{name:"Community posts",collection:"communityPosts",items:queues.community},
    opportunities:{name:"Opportunities",collection:"agriculturalOpportunities",items:queues.opportunities},
    markets:{name:"Market reports",collection:"marketPriceReports",items:queues.markets}
  };
  const current=config[tab];
  return <section className="svx-panel">
    <div className="svx-panelHead"><div><span className="svx-eyebrow">ADMINISTRATOR WORKSPACE</span><h2>Network moderation</h2><p>Review farmer posts, opportunity listings, local market observations and veterinary consultation requests.</p></div><ShieldCheck size={28}/></div>
    <div className="svx-adminTabs">{Object.entries(config).map(([key,value])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{value.name} <span>{value.items.length}</span></button>)}</div>
    {message&&<Notice>{message}</Notice>}
    {current.items.length?current.items.map(item=><article className="svx-reviewCard" key={item.id}>
      <div className="svx-reviewContent">
        <div className="svx-postMeta"><span>{tab==="appointments"?"Consultation request":tab==="community"?item.category:tab==="opportunities"?item.type:"Market observation"}</span><span>{item.county||"County not supplied"}</span><span>{dateLabel(item.createdAt)}</span></div>
        <h3>{item.title||item.commodity||(item.animal+" · "+item.farmerName)}</h3>
        <p>{item.body||item.description||item.reason||[item.market,item.price?"KSh "+item.price+" / "+item.unit:"",item.observedDate].filter(Boolean).join(" · ")}</p>
        <small>{item.farmerName||item.organisation||item.market||"Submitted by a signed-in user"}{item.phone?" · "+item.phone:""}{item.contact?" · "+item.contact:""}</small>
      </div>
      <div className="svx-reviewActions">
        {tab==="appointments"?<><button className="svx-primary" disabled={busyId===item.id} onClick={()=>change(current.collection,item,"contacted")}>Mark contacted</button><button className="svx-secondary" disabled={busyId===item.id} onClick={()=>change(current.collection,item,"declined")}>Decline</button></>:<><button className="svx-primary" disabled={busyId===item.id} onClick={()=>change(current.collection,item,"published")}>Approve & publish</button><button className="svx-secondary" disabled={busyId===item.id} onClick={()=>change(current.collection,item,"rejected")}>Reject</button></>}
      </div>
    </article>):<div className="svx-empty"><CheckCircle2 size={24}/>No pending {current.name.toLowerCase()}.</div>}
    <p className="svx-source">Administrative decisions are recorded in Firestore. Contact and booking confirmation still need to be handled by an authorised staff member.</p>
  </section>;
}

export function GrowthHub({authUser,admin=false}) {
  const [tab,setTab]=useState("weather");
  const [vets,setVets]=useState([]);
  useEffect(()=>onSnapshot(query(collection(db,"veterinarians"),limit(100)),s=>setVets(s.docs.map(d=>({id:d.id,...d.data()}))),e=>console.warn("Veterinarian directory unavailable:",e.message)),[]);
  const content=useMemo(()=>({
    weather:<WeatherPanel/>,
    appointments:<Appointments authUser={authUser} vets={vets}/>,
    community:<Community authUser={authUser}/>,
    opportunities:<Opportunities authUser={authUser}/>,
    markets:<MarketInformation authUser={authUser}/>
  }),[tab,authUser?.uid,vets]);
  if(admin)return <ModerationAdmin/>;
  return <div className="svx-growthHub">
    <div className="svx-pageIntro"><span className="svx-eyebrow">SHAMBAVET AGRICULTURAL NETWORK</span><h1>Connect, learn and grow together.</h1><p>County weather, veterinary consultation requests, farmer discussions, verified opportunities and community-reported market information.</p><div className="svx-introNote"><ShieldCheck size={17}/> Community listings are reviewed before publication. Weather and market information include source and context.</div></div>
    <div className="svx-tabs" role="tablist" aria-label="Agricultural network">{TABS.map(([id,label,Icon])=><button type="button" role="tab" aria-selected={tab===id} key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}</div>
    {content[tab]}
  </div>;
}

import { firestoreListCollection, sendApiError } from './_lib/firebase-rest.js';
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 try{const docs=await firestoreListCollection('jobListings',500);const jobs=docs.filter(x=>x.status==='approved').map(x=>({id:x.id,title:x.title||'',organization:x.organization||'',category:x.category||'',county:x.county||'',workType:x.workType||'',workplace:x.workplace||'',createdAt:x.createdAt||null,status:x.status})).sort((a,b)=>Number(b.createdAt?.seconds||b.createdAt||0)-Number(a.createdAt?.seconds||a.createdAt||0));return res.status(200).json({jobs})}catch(e){return sendApiError(res,e)}
}

import { firestoreGet, firestoreListCollection, requireFirebaseUser, sendApiError } from './_lib/firebase-rest.js';
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 try{const user=await requireFirebaseUser(req);const sub=await firestoreGet('jobSeekerSubscriptions/'+user.uid);if(!sub?.active||Number(sub.expiresAt||0)<=Date.now())return res.status(403).json({error:'An active job seeker subscription is required.'});const docs=await firestoreListCollection('jobListings',500);const jobs=docs.filter(x=>x.status==='approved').map(x=>({id:x.id,description:x.description||'',requirements:x.requirements||'',salary:x.salary||'',deadline:x.deadline||'',applicationEmail:x.applicationEmail||'',applicationPhone:x.applicationPhone||'',applicationUrl:x.applicationUrl||''}));return res.status(200).json({jobs,expiresAt:sub.expiresAt})}catch(e){return sendApiError(res,e)}
}

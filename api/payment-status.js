const BASE='https://backend.payhero.co.ke/api/v2/transaction-status';
export default async function handler(req,res){
  res.setHeader('Content-Type','application/json');
  if(req.method!=='GET') return res.status(405).json({error:'GET required'});
  const reference=String(req.query?.reference||'').trim();
  if(!reference) return res.status(400).json({error:'Payment reference is required.'});
  const user=process.env.PAYHERO_API_USERNAME, pass=process.env.PAYHERO_API_PASSWORD;
  if(!user||!pass) return res.status(503).json({error:'PayHero API credentials are not configured in Vercel.'});
  try{
    const token=Buffer.from(`${user}:${pass}`).toString('base64');
    const r=await fetch(`${BASE}?reference=${encodeURIComponent(reference)}`,{headers:{Authorization:`Basic ${token}`}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) return res.status(502).json({error:'PayHero could not verify this payment.',detail:data});
    const status=String(data?.status||data?.data?.status||data?.transaction?.status||'').toLowerCase();
    const resultCode=data?.result_code??data?.data?.result_code??data?.transaction?.result_code;
    const paid=['success','successful','completed','complete','paid'].includes(status)||String(resultCode)==='0';
    return res.status(200).json({paid,status,reference});
  }catch(e){return res.status(500).json({error:e.message||'Unable to contact PayHero.'});}
}

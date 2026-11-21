const PAYHERO_BASE = 'https://backend.payhero.co.ke/api/v2';

function credentials() {
  const username = process.env.PAYHERO_API_USERNAME;
  const password = process.env.PAYHERO_API_PASSWORD;
  if (!username || !password) throw new Error('PayHero API username and password are not configured in Vercel.');
  return 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
}

export function getPayHeroChannelId() {
  const channel = Number(process.env.PAYHERO_CHANNEL_ID || process.env.VITE_PAYHERO_CHANNEL_ID || 0);
  if (!Number.isInteger(channel) || channel <= 0) throw new Error('PAYHERO_CHANNEL_ID is not configured in Vercel.');
  return channel;
}

export function normalizeKenyanPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  let normalized = digits;
  if (normalized.startsWith('0') && normalized.length === 10) normalized = '254' + normalized.slice(1);
  else if ((normalized.startsWith('7') || normalized.startsWith('1')) && normalized.length === 9) normalized = '254' + normalized;
  if (!/^254[17]\d{8}$/.test(normalized)) throw new Error('Enter a valid Kenyan M-PESA number, for example 0712345678.');
  return normalized;
}

export async function initiatePayHeroStk({ amount, phone, externalReference }) {
  const callbackUrl = process.env.PAYHERO_CALLBACK_URL || 'https://shambavet.vercel.app/api/payhero-callback';
  const payload = {
    amount: Number(amount),
    phone_number: phone,
    channel_id: getPayHeroChannelId(),
    provider: 'm-pesa',
    external_reference: externalReference,
    callback_url: callbackUrl
  };
  const response = await fetch(PAYHERO_BASE + '/payments', {
    method: 'POST',
    headers: {
      Authorization: credentials(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false || !data.reference) {
    throw new Error(data?.message || data?.error || 'PayHero could not send the M-PESA STK prompt. Check your PayHero account and channel.');
  }
  return data;
}

export async function getPayHeroTransactionStatus(reference) {
  if (!reference) throw new Error('The PayHero transaction reference is missing.');
  const response = await fetch(PAYHERO_BASE + '/transaction-status?reference=' + encodeURIComponent(reference), {
    headers: { Authorization: credentials() },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('PayHero could not verify the payment status.');
  const result = data?.data?.status ? data.data : data?.transaction?.status ? data.transaction : data;
  return {
    ...result,
    status: String(result?.status || data?.status || data?.data?.transaction_status || '').toUpperCase(),
    reference: result?.reference || data?.reference || data?.data?.reference || '',
    amount: result?.amount ?? data?.amount ?? data?.data?.amount
  };
}

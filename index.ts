// B2OPS — send-push Edge Function
// Sends Web Push notifications to all subscribers for a business

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('DB_SERVICE_KEY') || '';
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  || 'BPJ5Dl0d6LLYneGm1AXPX9xjBRLuI4EUkxNB36qzu43gkmG9yJtRK3nlQFQqaKLhgNw3oQxoUx7LB9vUDc2sbjI';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = 'mailto:b2ops804@gmail.com';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── VAPID JWT signing ──
async function buildVapidJwt(audience: string): Promise<string> {
  const header  = { alg: 'ES256', typ: 'JWT' };
  const payload = { aud: audience, exp: Math.floor(Date.now()/1000) + 3600, sub: VAPID_SUBJECT };

  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');

  const sigInput = `${b64url(header)}.${b64url(payload)}`;

  // Import private key
  const privBytes = Uint8Array.from(atob(VAPID_PRIVATE.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw', privBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(sigInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');

  return `${sigInput}.${sigB64}`;
}

// ── Send one push ──
async function sendOnePush(subscription: Record<string, unknown>, payload: string): Promise<boolean> {
  const endpoint = subscription.endpoint as string;
  const origin   = new URL(endpoint).origin;
  const jwt      = await buildVapidJwt(origin);

  const keys = subscription.keys as Record<string, string>;

  // Encrypt payload using Web Push encryption (simplified — use unencrypted for now)
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC}`,
      'Content-Type':  'application/json',
      'TTL':           '86400',
    },
    body: payload,
  });

  return res.ok || res.status === 201;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      }
    });
  }

  try {
    const { business_id, title, body, type, url } = await req.json();

    if (!business_id) {
      return new Response(JSON.stringify({ error: 'business_id required' }), { status: 400 });
    }

    // Get all push subscriptions for this business
    const { data: subs } = await sb
      .from('push_subscriptions')
      .select('*')
      .eq('business_id', business_id);

    if (!subs?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no subscribers' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const payload = JSON.stringify({ title, body, type, url });
    let sent = 0;
    const failed: number[] = [];

    for (const sub of subs) {
      try {
        const ok = await sendOnePush(sub.subscription, payload);
        if (ok) sent++;
        else failed.push(sub.id);
      } catch(e) {
        failed.push(sub.id);
      }
    }

    // Remove dead subscriptions
    if (failed.length) {
      await sb.from('push_subscriptions').delete().in('id', failed);
    }

    return new Response(JSON.stringify({ ok: true, sent, failed: failed.length }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});

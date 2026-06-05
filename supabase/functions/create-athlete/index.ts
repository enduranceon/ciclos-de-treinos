import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verificar se o chamador é um coach autenticado
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Client do chamador (para verificar identidade)
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Verificar se o chamador é coach
    const { data: coachProfile } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (coachProfile?.role !== 'coach') {
      return new Response(JSON.stringify({ error: 'Apenas coaches podem criar atletas' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { full_name, email, password } = await req.json();

    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: 'Nome e e-mail são obrigatórios' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Admin client — cria usuário sem necessidade de confirmação por e-mail
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: password || crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      email_confirm: true, // cria já confirmado — atleta pode fazer reset de senha depois
      user_metadata: { full_name },
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const athleteId = newUser.user.id;

    // Garantir profile como atleta (trigger já cria, mas garante)
    await admin
      .from('profiles')
      .upsert({ id: athleteId, role: 'athlete', full_name }, { onConflict: 'id' });

    // Criar vínculo coach ↔ atleta
    await admin
      .from('coach_athlete')
      .upsert({ coach_id: caller.id, athlete_id: athleteId, status: 'active' }, {
        onConflict: 'coach_id,athlete_id',
      });

    // Gerar magic link para o atleta definir a senha (opcional, não bloqueia)
    let resetLink: string | null = null;
    try {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${req.headers.get('origin') || supabaseUrl}/` },
      });
      resetLink = (linkData as any)?.properties?.action_link || null;
    } catch (_) {}

    return new Response(JSON.stringify({
      athlete: { id: athleteId, email, full_name },
      reset_link: resetLink,
    }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

// seguranca.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://ymyxikhlhkkvcufgwufe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlteXhpa2hsaGtrdmN1Zmd3dWZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTc4MTYsImV4cCI6MjA4NjQ5MzgxNn0.kcbbkKDx1Jt2ayX2KwJa0Pr8ZsGTj4BTxV1y2RXU9WA';

const supabase = createClient(supabaseUrl, supabaseKey);

export async function validarAcessoTotal(ehPaginaAdmin) {

    // 1. IDENTIDADE
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // 2. EMAIL CONFIRMADO
    if (!session.user.email_confirmed_at) {
        window.mostrarMensagem("Acesso negado: Confirme seu e-mail.");
        setTimeout(() => { window.location.href = 'index.html'; }, 3000);
        return;
    }

    // 3. MFA
    const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaData.currentLevel !== 'aal2') {
        window.location.href = 'verificar-mfa.html';
        return;
    }

    // 4. BUSCA PERFIL
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('status_acesso, expira_em')
        .eq('id', session.user.id)
        .single();

    if (error || !profile) {
        window.location.href = 'index.html';
        return;
    }

    const ehAdmin = profile.status_acesso === 'admin';
    const ehBeta = profile.status_acesso === 'beta';
    const ehPago = profile.status_acesso === 'pago';
    const estaExpirado = profile.expira_em && new Date(profile.expira_em) < new Date();

    // ADMIN
    if (ehAdmin) {
        return;
    }

    // BLOQUEIA ACESSO AO PAINEL PARA QUALQUER NÃO-ADMIN
    if (ehPaginaAdmin && !ehAdmin) {
        window.location.href = 'alunos.html';
        return;
    }

    // ALUNO ATIVO
    if ((ehBeta || ehPago) && !estaExpirado) {
        return;
    }

    // PENDENTE OU EXPIRADO
    let mensagemErro = (profile.status_acesso === 'pendente')
        ? "Efetue o Pagamento para ter acesso ao conteúdo."
        : "Por favor, revalide ou renove sua assinatura para continuar com acesso.";

    window.mostrarMensagem(mensagemErro);

    setTimeout(() => {
        window.location.href = 'index.html';
    }, 3000);
}

// PASSKEY - BASE (NÃO INTEGRADA)

export async function buscarPasskeys(userId) {

  const { data, error } = await supabase
    .from('passkeys')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error("Erro ao buscar passkeys:", error);
    return [];
  }

  return data || [];
}

export async function criarPasskey(user) {

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: new Uint8Array(32),
        rp: { name: "Seu Sistema" },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email,
          displayName: user.email
        },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "none"
      }
    });

    if (!credential) return false;

    const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));

    const { error } = await supabase
      .from('passkeys')
      .insert({
        user_id: user.id,
        credential_id: credentialId,
        public_key: JSON.stringify(credential.response)
      });

    if (error) {
      console.error("Erro ao salvar passkey:", error);
      return false;
    }

    return true;

  } catch (e) {
    console.error("Erro ao criar passkey:", e);
    return false;
  }
}

export async function validarPasskey(passkeys) {

  try {
    const allowCredentials = passkeys.map(pk => ({
      id: Uint8Array.from(atob(pk.credential_id), c => c.charCodeAt(0)),
      type: "public-key"
    }));

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array(32),
        allowCredentials,
        userVerification: "preferred",
        timeout: 60000
      }
    });

    return !!credential;

  } catch (e) {
    console.warn("Falha ao validar passkey (ignorando):", e);
    return false;
  }
}

// DISPOSITIVO - IDENTIFICAÇÃO

function gerarDeviceId() {
  let deviceId = localStorage.getItem('device_id');

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('device_id', deviceId);
  }

  return deviceId;
}

export async function registrarDispositivo(userId) {
  const deviceId = gerarDeviceId();

  const { data: existentes } = await supabase
    .from('devices')
    .select('*')
    .eq('user_id', userId);

  const jaExiste = existentes?.some(d => d.device_id === deviceId);

  if (jaExiste) return;

  // Limite simples (5 dispositivos)
  if (existentes && existentes.length >= 5) {
  console.warn("Limite de dispositivos atingido");

  await supabase.from('alerts').insert({
    user_id: userId,
    tipo: 'limite_dispositivos',
    detalhe: 'limite atingido'
  });

  return;
}

  const local = await obterLocalizacao();

await supabase
  .from('devices')
  .insert({
    user_id: userId,
    device_id: deviceId,
    cidade: local.cidade,
    pais: local.pais,
    criado_em: new Date().toISOString()
  });

// GEOLOCALIZAÇÃO (SIMPLES)

async function obterLocalizacao() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();

    return {
      cidade: data.city || 'Desconhecida',
      pais: data.country_name || 'Desconhecido'
    };

  } catch (e) {
    console.warn("Erro ao obter localização:", e);
    return {
      cidade: 'Desconhecida',
      pais: 'Desconhecido'
    };
  }
}

// MONITORAMENTO INTELIGENTE

export async function analisarComportamento(userId, deviceIdAtual) {
  try {
    const { data: devices } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', userId);

    if (!devices || devices.length === 0) return;

    const atual = devices.find(d => d.device_id === deviceIdAtual);

    // 🔍 NOVA CIDADE
    const cidadesUnicas = [...new Set(devices.map(d => d.cidade))];

   if (cidadesUnicas.length > 2) {
  console.warn("ALERTA: múltiplas cidades detectadas", cidadesUnicas);

  await supabase.from('alerts').insert({
    user_id: userId,
    tipo: 'multi_cidade',
    detalhe: JSON.stringify(cidadesUnicas)
  });
}

    // 🔍 MUITOS DISPOSITIVOS
    if (devices.length > 5) {
  console.warn("ALERTA: muitos dispositivos", devices.length);

  await supabase.from('alerts').insert({
    user_id: userId,
    tipo: 'muitos_dispositivos',
    detalhe: devices.length.toString()
  });
}

    // 🔍 DISPOSITIVO NOVO
    if (!atual) {
  console.warn("ALERTA: novo dispositivo detectado");

  await supabase.from('alerts').insert({
    user_id: userId,
    tipo: 'novo_dispositivo',
    detalhe: deviceIdAtual
  });
}

  } catch (e) {
    console.warn("Erro ao analisar comportamento:", e);
  }
}

export function obterDeviceAtual() {
  return localStorage.getItem('device_id');
}

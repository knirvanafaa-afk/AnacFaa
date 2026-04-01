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

// Função para capturar IP e Cidade (Gratuita via ipapi.co)

async function obterLocalizacao() {
  try {
    const res = await fetch('https://ipwho.is/');
    const data = await res.json();

    if (!data.success) {
      throw new Error("API não retornou sucesso");
    }

    return {
      ip: data.ip || '0.0.0.0',
      cidade: data.city || 'Desconhecida',
      regiao: data.region || 'N/A',
      pais: data.country || 'N/A'
    };

  } catch (error) {
    console.warn("Erro ao obter localização:", error);

    return { 
      ip: '0.0.0.0', 
      cidade: 'Desconhecida', 
      regiao: 'N/A', 
      pais: 'N/A' 
    };
  }
}

export async function analisarSeguranca(userId) {
try {
  const loc = await obterLocalizacao();

  // 1. Registrar o Log de Acesso no Banco
const { error } =
  await supabase.from('access_logs').insert([{
    user_id: userId,
    ip_address: loc.ip,
    city: loc.cidade,
    region: loc.regiao,
    country: loc.pais
  }]);

if (error) console.error("Erro ao gravar log:", error);

  // 2. Checar quantidade de dispositivos
  const { data: passkeys } = await supabase
    .from('user_passkeys')
    .select('id')
    .eq('user_id', userId);

  if (passkeys && passkeys.length > 5) {
    // Alerta de muitos dispositivos (O seu limite de 5)
    await supabase.from('security_alerts').insert([{
      user_id: userId,
      type: 'Muitos Dispositivos',
      details: { quantidade: passkeys.length, mensagem: "Usuário passou de 5 aparelhos vinculados." }
    }]);
    console.log("⚠️ Alerta: Muitos dispositivos detectados.");
  }
  
  return loc;
} catch (e) {

console.error("Falha no monitoramento:", e); 
        }
}

// Função para registrar um novo aparelho (Passkey)
export async function registrarDispositivo(userId) {
  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const publicKeyCredentialCreationOptions = {
      challenge: challenge,
      rp: { name: "SKYLicense", id: window.location.hostname },
      user: {
        id: Uint8Array.from(userId.replace(/-/g, ""), c => c.charCodeAt(0)),
        name: "usuario@skylicense.com.br",
        displayName: "Seu Dispositivo SKY"
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }], // Algoritmo ES256
      authenticatorSelection: { userVerification: "required" },
      timeout: 60000
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    });

    // Salvar no Supabase
    const { error } = await supabase.from('user_passkeys').insert([{
      user_id: userId,
      credential_id: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
      public_key: "dispositivo_vinculado", // Simplificado para o fluxo cliente
      nickname: navigator.userAgent.slice(0, 50) // Guarda o nome do navegador/sistema
    }]);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Erro ao registrar passkey:", err);
    return false;
  }
}

// Função para validar se o aparelho atual já é conhecido
export async function validarDispositivoConhecido(userId) {
  try {
    // 1. Busca as chaves que o usuário já tem no banco
    const { data: keys } = await supabase
      .from('user_passkeys')
      .select('credential_id')
      .eq('user_id', userId);

    if (!keys || keys.length === 0) return { status: 'novo' };

    // 2. Prepara o desafio para o navegador checar se este hardware possui uma dessas chaves
    const allowCredentials = keys.map(k => ({
      id: Uint8Array.from(atob(k.credential_id), c => c.charCodeAt(0)),
      type: 'public-key'
    }));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array(32),
        allowCredentials: allowCredentials,
        timeout: 10000, // Tempo curto para ser rápido
        userVerification: "discouraged" // Tenta fazer silencioso se possível
      }
    });

    return { status: 'reconhecido', id: assertion.id };
  } catch (err) {
    // Se der erro ou cancelar, tratamos como não reconhecido
    return { status: 'desconhecido' };
  }
}

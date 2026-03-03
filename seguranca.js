// seguranca.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://ymyxikhlhkkvcufgwufe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlteXhpa2hsaGtrdmN1Zmd3dWZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTc4MTYsImV4cCI6MjA4NjQ5MzgxNn0.kcbbkKDx1Jt2ayX2KwJa0Pr8ZsGTj4BTxV1y2RXU9WA';

const supabase = createClient(supabaseUrl, supabaseKey);

export async function validarAcessoTotal(ehPaginaAdmin) {
    // 1. IDENTIDADE
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    // 2. EMAIL
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

    if (error || !profile) { window.location.href = 'index.html'; return; }

    const ehAdmin = (profile.status_acesso === 'admin');
    const ehPaganteOuBeta = (profile.status_acesso === 'beta' || profile.status_acesso === 'pago');
    const estaExpirado = profile.expira_em && new Date(profile.expira_em) < new Date();
    
    // LÓGICA DE ROTEAMENTO
    if (ehAdmin) {
        // Admin entra em tudo: Permite a execução seguir normalmente
        return; 
    }

    if (ehPaganteOuBeta && !estaExpirado) {
        if (ehPaginaAdmin) {
            // Aluno tentando acessar painel Admin -> Expulsa para o aluno
            window.location.href = 'alunos.html';
            return;
        }
        // Aluno na página de aluno -> Permite a execução seguir normalmente
        return;
    }

    // Se chegou aqui, é PENDENTE ou EXPIRADO
    // ROTEAMENTO DE ERRO COM O SEU ALERTA PERSONALIZADO
    let mensagemErro = (profile.status_acesso === 'pendente')
        ? "Efetue o Pagamento para ter acesso ao conteúdo."
        : "Por favor, revalide ou renove sua assinatura para continuar com acesso.";

    // Chama a função que já existe no seu HTML
    window.mostrarMensagem(mensagemErro);

    // Aguarda 3 segundos para o usuário ler, depois redireciona
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 3000);
}

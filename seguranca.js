// seguranca.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://ymyxikhlhkkvcufgwufe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlteXhpa2hsaGtrdmN1Zmd3dWZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTc4MTYsImV4cCI6MjA4NjQ5MzgxNn0.kcbbkKDx1Jt2ayX2KwJa0Pr8ZsGTj4BTxV1y2RXU9WA';

const supabase = createClient(supabaseUrl, supabaseKey);

export async function validarAcessoTotal(ehPaginaAdmin) {
    // REDE DE PROTEÇÃO: Se algo der errado, libera a tela após 3 segundos
    const timerProtecao = setTimeout(() => {
        document.body.style.display = 'block';
        console.warn("Segurança demorou, liberando tela por precaução.");
    }, 3000);

    try {
        // 1. IDENTIDADE
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { window.location.href = 'index.html'; return; }

        // 2. EMAIL
        if (!session.user.email_confirmed_at) {
            clearTimeout(timerProtecao); // Remove a trava de segurança
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
        
        const temAcesso = ehAdmin || (ehPaganteOuBeta && !estaExpirado);

        // FINALIZAÇÃO (Remove o timer e libera a tela)
        clearTimeout(timerProtecao); 

        if (temAcesso) {
            if (ehAdmin) {
                document.body.style.display = 'block';
            } else if (ehPaginaAdmin) {
                window.location.href = 'alunos.html';
            } else {
                document.body.style.display = 'block';
            }
        } else {
            let mensagemErro = (profile.status_acesso === 'pendente')
                ? "Efetue o Pagamento para ter acesso ao conteúdo."
                : "Por favor, revalide ou renove sua assinatura para continuar com acesso.";

            window.mostrarMensagem(mensagemErro);
            setTimeout(() => { window.location.href = 'index.html'; }, 3000);
        }

    } catch (err) {
        console.error("Erro fatal:", err);
        document.body.style.display = 'block'; // Em caso de erro, pelo menos não deixa em branco
    }
}

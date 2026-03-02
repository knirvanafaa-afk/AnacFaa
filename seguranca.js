// seguranca.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://ymyxikhlhkkvcufgwufe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlteXhpa2hsaGtrdmN1Zmd3dWZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTc4MTYsImV4cCI6MjA4NjQ5MzgxNn0.kcbbkKDx1Jt2ayX2KwJa0Pr8ZsGTj4BTxV1y2RXU9WA';

const supabase = createClient(supabaseUrl, supabaseKey);

export async function validarAcessoTotal() {
    try {
        // 1. IDENTIDADE
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return false;
        }

        // 2. EMAIL
        if (!session.user.email_confirmed_at) {
            alert("Acesso negado: Confirme seu e-mail.");
            window.location.href = 'index.html';
            return false;
        }

        // 3. MFA
        const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (mfaData.currentLevel !== 'aal2') {
            window.location.href = 'verificar-mfa.html';
            return false;
        }

        // 4. AUTORIZAÇÃO E EXPIRAÇÃO
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('status_acesso, expira_em')
            .eq('id', session.user.id)
            .single();

        if (error || !profile) {
            window.location.href = 'index.html';
            return false;
        }

        const ehAdmin = (profile.status_acesso === 'admin');
        const ehBetaOuPago = (profile.status_acesso === 'beta' || profile.status_acesso === 'pago');
        const estaExpirado = profile.expira_em && new Date(profile.expira_em) < new Date();

        const temAcesso = ehAdmin || (ehBetaOuPago && !estaExpirado);

        if (!temAcesso) {
            alert("Acesso negado: Plano expirado ou sem permissão.");
            window.location.href = 'index.html';
            return false;
        }

        return true;

    } catch (err) {
        console.error("Erro na validação:", err);
        window.location.href = 'index.html';
        return false;
    }
}

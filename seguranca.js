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
    
    // Define se o usuário tem permissão para o conteúdo
    const temAcesso = ehAdmin || (ehPaganteOuBeta && !estaExpirado);

    if (temAcesso) {
        // ROTEAMENTO DE SUCESSO
        if (ehAdmin) {
            // Admin entra em tudo
            document.body.style.display = 'block';
        } else if (ehPaginaAdmin) {
            // Aluno tentando acessar painel Admin -> Expulsa para o aluno
            window.location.href = 'alunos.html';
        } else {
            // Aluno na página de aluno -> Libera
            document.body.style.display = 'block';
        }
   // ... (restante do código igual)

    } else {
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
}

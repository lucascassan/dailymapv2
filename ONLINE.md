# Versão online: GitHub Pages + Firebase

A interface continua sendo um site estático. O Firebase Authentication identifica os navegadores, e o Realtime Database guarda as sessões e distribui atualizações. Não é necessário hospedar um servidor Node.

## Configuração

1. Crie um projeto no [console do Firebase](https://console.firebase.google.com/) usando o plano Spark e registre um aplicativo Web.
2. Em Authentication → Sign-in method, habilite **Anonymous** (autenticação anônima). Em Settings → Authorized domains, cadastre o domínio do Pages, por exemplo `usuario.github.io`. Essa lista não bloqueia a autenticação anônima por localhost. O acesso online será protegido pelo App Check.
3. Crie o **Realtime Database** e copie a URL completa do banco, incluindo a região quando houver.
4. Copie a configuração pública do aplicativo Web para `firebase-config.js`, preenchendo também `databaseURL`. Não use credenciais de conta de serviço.
5. Em Realtime Database → Rules, substitua as regras pelo conteúdo de `database.rules.json` e publique. Não use regras abertas de teste. Alternativamente, com o Firebase CLI configurado para o projeto, execute `firebase deploy --only database`.
6. No GitHub, configure Settings → Pages para publicar a raiz desta branch. Os caminhos são relativos e funcionam em `https://usuario.github.io/repositorio/`. Não há etapa de build.

Documentação: [SDK Web](https://firebase.google.com/docs/web/setup), [autenticação anônima](https://firebase.google.com/docs/auth/web/anonymous-auth), [regras do banco](https://firebase.google.com/docs/database/security).

## Uso

- **Criar sessão** começa um mapa vazio e fornece um código de 4 caracteres com letras maiúsculas e números. O criador é o dono.
- **Entrar** recebe o mapa atual e acompanha posições, tamanhos, fontes, cor de fundo, membros, departamentos, alocações e tarefas. Edição é bloqueada pela interface e pelas regras do banco.
- Compartilhe o código usando **Copiar código**. Quem souber o código poderá visualizar a sessão.
- O dono pode importar JSON, editar normalmente e exportar JSON/PDF. A sincronização online preserva alocações e tarefas por área; a exportação JSON mantém o comportamento anterior de omitir as alocações.
- Zoom e maximização são individuais. As posições são proporcionais à tela e podem ser ajustadas para caber em telas diferentes.
- **Encerrar sessão**, disponível somente ao dono, encerra imediatamente o acompanhamento e mostra Sessão encerrada em vermelho no lugar de Conectado, para dono e visitantes conectados. O mapa fica disponível somente para leitura, com exportação JSON e PDF. Visitantes desconectados recebem o aviso ao reconectar. Uma sessão encerrada não aceita novas entradas nem alterações. Quem já estava no mapa pode exportar enquanto permanece na página. Depois de sair ou recarregar, ninguém pode entrar novamente na sessão encerrada, incluindo o dono.
- **Sair**, no menu Configurações, retorna ao diálogo Online/Offline e preserva o mapa local anterior. Não apaga a sessão compartilhada. O indicador mostra conexão, sincronização e falhas de gravação.
- Ao abrir o site, um único diálogo apresenta **Online** e **Offline** no topo. Offline utiliza os dados do navegador sem conectar ao Firebase; clique em Usar offline. Online permite Entrar com o código ou Criar sessão. O código da última sessão fica preenchido, quando disponível; clique em Entrar para recuperá-la. Depois de sair, informe o código e escolha **Entrar**. O papel de dono é recuperado automaticamente quando este navegador lembra a sessão e o servidor confirma a identidade original. Nos outros navegadores, a entrada é como visitante. O acesso de dono está ligado à identidade anônima salva **neste navegador e domínio**. Limpar os dados do site, usar outro navegador ou mudar o domínio perde esse acesso. Não há recuperação por senha nesta versão. Use uma aba de dono por sessão.
- Sem configuração, o modo local continua disponível; o botão de sessão explica a configuração pendente.

## Dados e limites

O banco usa `sessions/<numero>` com dono imutável, datas e um snapshot JSON de até 5 MB. O encerramento registra `closedAt`, sem apagar o registro, para avisar visitantes e impedir sua reabertura. Armazenar JSON como texto preserva listas vazias e os identificadores sem depender da conversão de arrays do Realtime Database. As regras impedem listar todas as sessões ou alterar o dono.

Durante o arraste há no máximo quatro snapshots por segundo. O volume transmitido cresce com o tamanho do mapa e o código de visitantes; acompanhe as cotas do plano gratuito no console. Sessões ficam armazenadas até exclusão manual pelo console nesta versão.

## Validação

`node --check app.js`, `node --check online.js` e `node --check firebase-client.js` verificam a sintaxe. `node tests/online.test.cjs` exercita a interface com um transporte simulado: dono, dois visitantes, permissões, atualizações, reconexão e isolamento do mapa local. Requer Playwright e Edge instalados; configure `PLAYWRIGHT_MODULE` se necessário.

Após configurar o Firebase, valide em três navegadores/perfis diferentes. No Rules Playground, confirme: leitura de uma sessão específica autenticada permitida; leitura de `/sessions` negada; criação com o próprio UID permitida; escrita por outro UID, mudança de dono e escrita em sessão encerrada negadas. O teste simulado não substitui essa verificação das regras publicadas.

Após atualizar o código de encerramento, publique novamente `database.rules.json` no Firebase.

Os códigos antigos de 12 dígitos continuam aceitos no banco para retomada de sessões já salvas. Novas sessões usam quatro caracteres; códigos em uso nunca são sobrescritos. Republique as regras após atualizar o formato dos códigos.

## App Check obrigatório no modo Online

1. No Google Cloud, selecione o mesmo projeto Firebase e crie uma chave **reCAPTCHA Enterprise para Web, baseada em pontuação (score-based)**. Mantenha a verificação de domínio habilitada e cadastre somente o domínio real do site, por exemplo `usuario.github.io`, sem protocolo ou caminho. Não cadastre localhost ou 127.0.0.1.
2. No Firebase → App Check → Apps, registre o aplicativo Web com o provedor **reCAPTCHA Enterprise**, usando a chave de site criada acima.
3. Preencha `window.DAILY_APP_CHECK_CONFIG.siteKey` em `firebase-config.js` com a chave pública de site. Não use chave secreta ou credenciais de serviço.
4. Publique os arquivos atualizados do site. O código inicializa o App Check antes de Authentication e Realtime Database, obtém um token e ativa a renovação automática. Sem configuração ou sem token válido, não inicia o acesso online. Offline não carrega o SDK Firebase nem o reCAPTCHA.
5. Verifique as métricas de requisições do App Check usando o site publicado. Quando os acessos legítimos aparecerem como verificados, ative **Enforce / Aplicar** para **Realtime Database**. Se disponível para o projeto, aplique também em **Authentication** após validar as métricas.
6. Remova tokens de depuração cadastrados. Esta implementação não habilita debug automaticamente e não inclui tokens de debug no repositório.
7. Teste criar/entrar no domínio publicado e confirme que uma cópia local não consegue usar as sessões online. Tokens já emitidos podem continuar válidos até expirar.

**A exigência no console é essencial:** o código sozinho não impede que alguém faça chamadas diretas ao Firebase. As regras do banco continuam necessárias para limitar a edição ao dono. App Check não impede um usuário legítimo no site de tentar adivinhar códigos de quatro caracteres.

Sem a chave de site e sem acesso ao console, a integração pode ser testada com SDK simulado, mas não se pode confirmar a proteção do projeto real. As cotas e eventual cobrança do reCAPTCHA Enterprise devem ser conferidas antes de ativar.

Documentação: [Configurar reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [ativar obrigatoriedade](https://firebase.google.com/docs/app-check/enable-enforcement), [tokens de depuração](https://firebase.google.com/docs/app-check/web/debug-provider).

Execute `node --test tests/app-check.test.cjs` para verificar configuração obrigatória, inicialização, renovação automática, falha de token e nova tentativa.

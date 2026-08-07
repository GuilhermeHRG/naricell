# Assistência Firebase — Licença única

Sistema React + TypeScript + Firebase Authentication + Cloud Firestore, sem backend próprio e sem Firebase Hosting obrigatório.

Esta versão foi reestruturada para você vender o sistema a várias assistências usando **um único projeto Firebase**.

## O que mudou

O banco agora é licença única. Os dados operacionais não ficam mais em coleções na raiz do Firestore.

```text
empresas/{empresaId}
  configuracoes/{app|empresa|contadorOS}
  licencas/{status|gestao}
  usuarios/{uid}
  clientes/{clienteId}
  produtos/{produtoId}
  servicos/{servicoId}
  movimentacoesEstoque/{movimentoId}
  ordensServico/{osId}
    itens/{itemId}
    historico/{historicoId}
  contasReceber/{contaId}
  recebimentos/{recebimentoId}
  contasPagar/{contaId}
  pagamentos/{pagamentoId}
  fornecedores/{fornecedorId}

acessos/{uid}
  empresaId
  email
  ativo
```

Cada usuário operacional possui somente um `empresaId` em `acessos/{uid}`. Por isso, uma assistência não pode ler, gravar ou listar dados de outra.

## Acesso mestre

O e-mail mestre é:

```text
guilhermeg.dev@gmail.com
```

Ele não pertence a nenhuma empresa e não aparece em nenhuma tela de usuários das assistências.

Ao entrar com esse e-mail, aparece somente o painel:

```text
Empresas e licenças
```

Nesse painel você pode:

- criar uma empresa;
- criar o primeiro administrador da empresa;
- criar usuários adicionais vinculados à empresa;
- definir plano, mensalidade, bloqueio e validade da licença;
- ativar ou inativar uma empresa;
- consultar usuários ativos por empresa.

## Primeira configuração

### 1. Firebase Authentication

No Firebase Console, habilite:

```text
Authentication
→ Sign-in method
→ Email/Password
→ Enable
```

Confirme que existe uma conta com:

```text
guilhermeg.dev@gmail.com
```

### 2. Arquivo `.env`

Na raiz do projeto, crie ou ajuste o arquivo `.env`:

```env
VITE_MASTER_EMAIL=guilhermeg.dev@gmail.com
```

### 3. Firestore Rules

No Firebase Console:

```text
Firestore Database
→ Rules
```

Apague todas as regras atuais, copie todo o conteúdo de `firestore.rules` deste projeto e clique em **Publish**.

Não misture as regras anteriores com estas Rules licença única.

### 4. Iniciar o sistema

```powershell
npm install
npm run dev
```

Acesse a URL mostrada pelo Vite, geralmente:

```text
http://localhost:5173
```

### 5. Criar a primeira empresa

1. Faça login com `guilhermeg.dev@gmail.com`.
2. Abra **Empresas e licenças**.
3. Clique em **Nova empresa**.
4. Informe os dados da assistência, da licença e do administrador inicial.
5. Salve.

A empresa será criada com:

- configurações iniciais;
- contador de OS independente;
- licença própria;
- administrador próprio;
- estrutura isolada de dados.

## Vincular um usuário que já existe no Authentication

Se o administrador da loja já foi criado antes no Firebase Authentication, não tente criar novamente o mesmo e-mail.

Na criação da empresa:

1. Marque **Vincular usuário já criado no Firebase Authentication**.
2. Abra o Firebase Console:

```text
Authentication
→ Users
```

3. Copie o **UID** do usuário existente.
4. Cole no campo de UID da tela de criação de empresa.

O sistema criará o vínculo no Firestore sem recriar a conta de login.

## Atenção sobre os dados antigos

A versão anterior gravava dados em coleções na raiz, como:

```text
clientes
produtos
ordensServico
usuarios
configuracoes
```

Esta versão não usa mais essas coleções. Elas não serão exibidas no sistema licença única.

Para dados de teste, o caminho recomendado é criar a primeira empresa e cadastrar novamente.

Para dados reais, faça backup antes de publicar as novas Rules. A migração dos dados antigos para `empresas/{empresaId}/...` deve ser feita de forma controlada; ela não foi executada automaticamente para evitar duplicação ou associação incorreta de registros.

## Segurança e limites

- O cliente não deve ter acesso de proprietário ao projeto Firebase.
- O cliente deve usar somente o login do sistema.
- A licença é validada nas Firestore Rules com `request.time`, usando a hora do servidor Firebase.
- Sem licença ativa, usuários da empresa não conseguem ler nem gravar dados operacionais.
- A criação de usuários pelo navegador usa um Firebase Auth secundário. A conta é criada no Authentication e, na sequência, é vinculada à empresa por um lote atômico no Firestore.

## Publicação sem Firebase Hosting

Depois de executar:

```powershell
npm run build
```

publique a pasta `dist` em qualquer hospedagem estática, como Vercel, Netlify, Cloudflare Pages ou servidor web próprio.

Caso use um domínio próprio, adicione-o em:

```text
Firebase Console
→ Authentication
→ Settings
→ Authorized domains
```


## Estrutura atual

Esta versão utiliza uma única instalação, sem multiempresa. A licença fica em `licencas/status` e os dados operacionais ficam em coleções globais. Consulte `AJUSTES_LICENCA_UNICA.md`.

## Usuários pelo painel mestre

O painel mestre administra Authentication e Firestore por Cloud Functions. Consulte `CONFIGURACAO_USUARIOS_MESTRE.md` e publique com:

```bash
firebase deploy --only firestore:rules,functions
```

## Cadastro de usuários no plano gratuito

A versão atual não usa Cloud Functions. A criação é feita por uma instância secundária do Firebase Authentication, mantendo o administrador conectado. Consulte `CONFIGURACAO_SEM_CLOUD_FUNCTIONS.md` para conhecer as limitações de edição e exclusão.

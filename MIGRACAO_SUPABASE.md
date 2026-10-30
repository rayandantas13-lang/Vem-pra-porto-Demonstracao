# Preparação da migração para o Supabase

**A migração ainda não está concluída.** Uma cópia das abas Vouchers, Gastos,
Config e Auditoria foi colocada no esquema privado `migration_private` do
projeto Supabase autorizado. As contagens e os identificadores foram conferidos
com o Excel. Os vouchers, gastos e configurações também foram copiados
para tabelas operacionais protegidas por RLS, e o adaptador foi preparado nesta
branch. Já existe um perfil administrador ativo no projeto de teste. Ainda
faltam a reconciliação final e os testes reais antes de publicar e trocar o
aplicativo.

A função temporária usada para copiar o Excel foi removida após a importação.
As abas de usuários e sessões não foram importadas. Nenhum dado de clientes foi
colocado nos arquivos desta branch.

## Preparar um snapshot

Exporte cada aba separadamente como CSV UTF-8. Com Python 3, execute:

```sh
python scripts/preparar_snapshot.py \
  --vouchers /caminho/Vouchers.csv \
  --gastos /caminho/Gastos.csv \
  --config /caminho/Config.csv \
  --auditoria /caminho/Auditoria.csv > /caminho/privado/snapshot.sql
```

Os argumentos são opcionais, mas para uma migração completa devem ser
fornecidas todas as abas relevantes. O comando valida os cabeçalhos e IDs e
informa a quantidade de linhas preparada. O snapshot mantém todos os valores
originais como texto no JSON, inclusive números, datas e listas serializadas;
a conversão e verificação no modelo final ainda são necessárias.

O SQL contém dados pessoais de clientes. Mantenha-o em local privado, não o
adicione ao repositório e exclua-o após o uso seguro. O script foi projetado
para o editor SQL do Supabase, por um administrador: grava em esquema privado,
revoga acesso público e habilita RLS, mas **não o execute antes de revisar o
plano da migração e de ter um backup**. Importar o snapshot isoladamente não
faz o sistema funcionar com o Supabase. Reexecutar o SQL substitui o snapshot
somente das abas informadas, numa transação.

Senhas e sessões antigas não são incluídas: dependem de segredos do Apps Script
e exigem um novo mecanismo de autenticação. Não compartilhe senhas ou chaves
privadas pelo chat. A planilha original não é alterada por esse processo.

Teste o utilitário com `python -m unittest discover -s tests -v`.

## Estado atual do projeto de teste

As tabelas operacionais de vouchers, gastos e configuração também foram criadas
a partir do snapshot. Possuem RLS: contas sem perfil ativo não têm acesso, e
somente administradores podem modificar configurações. A auditoria nova registra
alterações sem copiar dados de clientes. A auditoria histórica continua no
snapshot privado. O sistema ainda não foi publicado nem testado com um usuário
real; não faça o corte para o Supabase antes dessa validação.

O adaptador nesta branch é ativado apenas quando as variáveis públicas de build
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` são preenchidas. Com ambas ausentes,
o comportamento antigo permanece. Se apenas uma for preenchida, ele falha de
forma segura e não volta automaticamente para o Google Sheets. Nunca coloque a
chave `service_role` ou qualquer chave secreta em variáveis `VITE_*`.

Para um novo usuário, a conta autenticada deve ser criada no painel Supabase
com o e-mail indicado pelo proprietário, que define a senha diretamente lá. Um
administrador do banco precisa associar o UUID autenticado a um perfil
`vpp_profiles` ativo; criar uma conta Auth por si só **não** concede acesso aos
dados. A interface de
cadastro e ativação de usuários permanece desabilitada no modo Supabase e o
gerenciamento requer intervenção administrativa no banco. Senhas e sessões do
Apps Script não foram transferidas.

O snapshot não sincroniza alterações feitas depois da exportação. Antes de
publicar e mudar a fonte de dados, interrompa novas gravações na planilha,
importe e reconcilie as alterações posteriores, faça backup e valide login,
permissões, edição de vouchers, gastos e configurações. Até a publicação, o site
anterior continua usando o Google Sheets.

### Configuração do deploy

Crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` como variáveis em
**Settings → Secrets and variables → Actions → Variables** no repositório. No
Supabase, a URL está em **Connect** ou nas configurações de API; use a chave
**publishable** ou a chave legada **anon public** para `VITE_SUPABASE_ANON_KEY`.
Essas informações são públicas; não use a chave `service_role` ou qualquer
chave secreta no frontend.

O workflow de deploy não foi alterado por falta de permissão para workflows na
conexão GitHub. Uma pessoa com essa permissão deve acrescentar ao bloco `env`
do passo `Gerar build`, em `.github/workflows/deploy.yml`:

```yaml
VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
```

Sem essa alteração e um novo build, o site publicado não usará as variáveis do
Supabase. Antes do corte, conclua a reconciliação e valide o login e os fluxos de
uso.

### Colunas de vouchers

A tabela operacional `vpp_vouchers` continua sendo a única tabela de vouchers.
Além de `id` e `data`, ela possui colunas de consulta geradas a partir do JSON;
essas colunas não é possível digitar diretamente. Edite pelo aplicativo, que
continua salvando o objeto completo em `data`. O campo `a_receber` reflete o
valor histórico salvo no JSON, não é um cálculo atualizado automaticamente e
pode estar ausente ou incorreto. Os valores ambíguos precisam de reconciliação;
não os trate como valores financeiros confirmados.

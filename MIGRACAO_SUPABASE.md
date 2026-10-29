# Preparação da migração para o Supabase

**A migração ainda não está concluída.** Uma cópia das abas Vouchers, Gastos,
Config e Auditoria foi colocada no esquema privado `migration_private` do
projeto Supabase autorizado. As contagens e os identificadores foram conferidos
com o Excel. Os vouchers, gastos e configurações também foram copiados
para tabelas operacionais protegidas por RLS, e o adaptador foi preparado nesta
branch. Ainda faltam o acesso administrador, a reconciliação final e os testes
reais antes de publicar e trocar o aplicativo.

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

A conta autenticada deverá ser criada no painel Supabase com o e-mail indicado
pelo proprietário, que define a senha diretamente lá. Depois, um administrador
do banco precisa associar o UUID autenticado a um perfil `vpp_profiles` ativo;
criar uma conta Auth por si só **não** concede acesso aos dados. A interface de
cadastro e ativação de usuários permanece desabilitada no modo Supabase e o
gerenciamento requer intervenção administrativa no banco. Senhas e sessões do
Apps Script não foram transferidas.

O snapshot não sincroniza alterações feitas depois da exportação. Antes de
publicar e mudar a fonte de dados, interrompa novas gravações na planilha,
importe e reconcilie as alterações posteriores, faça backup e valide login,
permissões, edição de vouchers, gastos e configurações. Até a publicação, o site
anterior continua usando o Google Sheets.

### Configuração do deploy

O workflow do GitHub Pages ainda precisa receber explicitamente as variáveis de
repositório no passo `Gerar build`, pois elas não são disponibilizadas ao Vite
sozinhas. Após criar as variáveis públicas `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` em **Settings → Secrets and variables → Actions →
Variables**, acrescente ao bloco `env` desse passo em `.github/workflows/deploy.yml`:

```yaml
VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
```

A conexão usada para preparar este PR não tinha permissão para alterar workflows,
por isso esse ajuste **não está incluído no PR**. Faça-o apenas depois da
reconciliação final e da validação do login e dos fluxos de uso. Não configure
nenhuma chave privada ou `service_role` como variável de build.

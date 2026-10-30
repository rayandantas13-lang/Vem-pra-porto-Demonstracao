import { createClient, type Session } from "@supabase/supabase-js";
import type { Config, DadosApi, GastoOperacional, Sessao, Usuario, Voucher } from "@/types";

const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const chave = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
export const configuracaoSupabaseIncompleta = !!url !== !!chave;
export const usandoSupabase = !!url || !!chave;
const cliente = !configuracaoSupabaseIncompleta && usandoSupabase ? createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

function db() {
  if (!cliente) throw new Error("Configuração incompleta: informe a URL e a chave pública do Supabase.");
  return cliente;
}

/* -------- Recuperação de senha -------- */

const RECUPERACAO_KEY = "vpp.recuperacao-senha";

/**
 * O link do e-mail de recuperação chega como #access_token=...&type=recovery.
 * Capturamos isso na carga da página (antes de o supabase-js limpar a URL) e
 * guardamos a marca: enquanto ela existir, o app NÃO entra automaticamente
 * com a sessão de recuperação — primeiro a pessoa define a nova senha.
 */
function detectarRecuperacaoNaUrl(): boolean {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#\/?/, ""));
    if (hash.get("type") === "recovery" && hash.get("access_token")) {
      sessionStorage.setItem(RECUPERACAO_KEY, "1");
      return true;
    }
    return sessionStorage.getItem(RECUPERACAO_KEY) === "1";
  } catch {
    return false;
  }
}

export const recuperacaoPendente = detectarRecuperacaoNaUrl();

/** Erro devolvido no link (ex.: link expirado ou já utilizado), se houver. */
export function erroDoLinkRecuperacao(): string {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#\/?/, ""));
    const codigo = hash.get("error_code") || "";
    if (!hash.get("error") && !codigo) return "";
    if (codigo === "otp_expired")
      return "Esse link de redefinição expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.";
    return "Esse link de redefinição não é mais válido. Peça um novo em “Esqueci minha senha”.";
  } catch {
    return "";
  }
}

/** Envia o e-mail com o link para redefinir a senha, voltando para este site. */
export async function solicitarRedefinicaoSenha(email: string): Promise<void> {
  const destino = `${window.location.origin}${window.location.pathname}`;
  const { error } = await db().auth.resetPasswordForEmail(email.trim(), { redirectTo: destino });
  if (error) throw new Error("Não foi possível enviar o e-mail de redefinição. Tente novamente em alguns instantes.");
}

/** Salva a nova senha da sessão de recuperação e encerra essa sessão. */
export async function redefinirSenha(novaSenha: string): Promise<void> {
  const { error } = await db().auth.updateUser({ password: novaSenha });
  if (error)
    throw new Error(
      /session/i.test(error.message)
        ? "O link de redefinição expirou. Peça um novo em “Esqueci minha senha”."
        : "Não foi possível salvar a nova senha. Tente novamente.",
    );
  sessionStorage.removeItem(RECUPERACAO_KEY);
  await db().auth.signOut().catch(() => {});
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

function erro(e: { message: string } | null) {
  if (e) throw new Error(e.message);
}

async function perfil(id: string): Promise<Usuario> {
  const { data, error } = await db().from("vpp_profiles").select("id,nome,email,usuario,papel,ativo,criado_em").eq("id", id).maybeSingle();
  erro(error);
  if (!data || !data.ativo) throw new Error("Usuário inativo ou sem acesso autorizado.");
  return { id: data.id, nome: data.nome, email: data.email, usuario: data.usuario, papel: data.papel, ativo: data.ativo, criadoEm: data.criado_em } as Usuario;
}

async function sessaoDe(s: Session): Promise<Sessao> {
  return { token: s.access_token, usuario: await perfil(s.user.id), expiraEm: new Date((s.expires_at || 0) * 1000).toISOString() };
}

export async function restaurarSupabase(): Promise<Sessao | null> {
  // Durante a redefinição de senha, a sessão do link não vira login automático.
  if (recuperacaoPendente) return null;
  const { data, error } = await db().auth.getSession();
  erro(error);
  if (!data.session) return null;
  return sessaoDe(data.session);
}

async function entrar(email: string, senha: string): Promise<Sessao> {
  const { data, error } = await db().auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error("Não foi possível entrar. Confira o e-mail e a senha.");
  try { return await sessaoDe(data.session); }
  catch (e) { await db().auth.signOut(); throw e; }
}

async function todos<T>(tabela: string): Promise<T[]> {
  // PostgREST limita páginas; não truncar bases com mais de 1000 registros.
  const saida: T[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await db().from(tabela).select("data").order("id").range(inicio, inicio + 499);
    erro(error);
    const itens = data || [];
    saida.push(...itens.map((r) => r.data as T));
    if (itens.length < 500) return saida;
  }
}

async function gravar<T extends { id: string }>(tabela: string, item: T): Promise<T> {
  const { error } = await db().from(tabela).upsert({ id: item.id, data: item });
  erro(error);
  return item;
}
async function remover(tabela: string, id: string) {
  const { error } = await db().from(tabela).delete().eq("id", id);
  erro(error);
}

export async function requisicaoSupabase<T>(p: Record<string, unknown>): Promise<T> {
  let resultado: unknown;
  switch (p.acao) {
    case "status": resultado = { temAdmin: true }; break;
    case "entrar": resultado = await entrar(String(p.usuario || ""), String(p.senha || "")); break;
    case "eu": {
      const s = await restaurarSupabase();
      if (!s) throw new Error("Sessão expirada. Entre novamente.");
      resultado = { usuario: s.usuario, expiraEm: s.expiraEm }; break;
    }
    case "sair": { const { error } = await db().auth.signOut(); erro(error); resultado = null; break; }
    case "dados": {
      const [vouchers, gastos, configResult] = await Promise.all([
        todos<Voucher>("vpp_vouchers"), todos<GastoOperacional>("vpp_gastos"), db().from("vpp_config").select("data").eq("id", true).single(),
      ]);
      erro(configResult.error);
      if (!configResult.data) throw new Error("Configurações não encontradas.");
      resultado = { vouchers, gastos, config: configResult.data.data as Config, versao: "9" } satisfies DadosApi;
      break;
    }
    case "salvarVoucher": resultado = await gravar("vpp_vouchers", p.voucher as Voucher); break;
    case "removerVoucher": resultado = await remover("vpp_vouchers", String(p.id)); break;
    case "salvarGasto": resultado = await gravar("vpp_gastos", p.gasto as GastoOperacional); break;
    case "removerGasto": resultado = await remover("vpp_gastos", String(p.id)); break;
    case "salvarConfig": {
      const { data, error } = await db().from("vpp_config").update({ data: p.config }).eq("id", true).select("data").single();
      erro(error); resultado = data?.data; break;
    }
    case "listarUsuarios": {
      const { data, error } = await db().from("vpp_profiles").select("id,nome,email,usuario,papel,ativo,criado_em").order("nome");
      erro(error);
      resultado = (data || []).map((u) => ({ ...u, criadoEm: u.criado_em })); break;
    }
    case "criarUsuario":
    case "alternarUsuario":
    case "criarPrimeiroAdmin": throw new Error("Por enquanto, gerencie acessos no painel do Supabase.");
    default: throw new Error("Ação não suportada no Supabase.");
  }
  return resultado as T;
}

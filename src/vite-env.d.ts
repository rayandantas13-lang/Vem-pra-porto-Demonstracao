/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do aplicativo web do Google Apps Script (variável do repositório GitHub). */
  readonly VITE_APPS_SCRIPT_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_MIGRACAO_TESTE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

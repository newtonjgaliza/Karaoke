// Configuração do Supabase para o Karaokê do Attilas
// Substitua pelos dados do seu projeto no painel do Supabase

const SUPABASE_URL = "https://kodcymoscigidlwpkthl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UBTZH1HY1R_I8zbQ3J2FQw_A9hWrQJj";

// Inicializa o cliente do Supabase
// Certifique-se de que a biblioteca do Supabase foi carregada antes via CDN
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

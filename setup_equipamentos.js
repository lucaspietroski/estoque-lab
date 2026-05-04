const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTable() {
    console.log("🛠 Criando tabela de equipamentos...");
    
    // Como não podemos rodar DDL (CREATE TABLE) diretamente via API anon/service sem RPC,
    // vamos apenas tentar um insert em uma tabela que "deveria" existir. 
    // Se o usuário já tiver o dashboard do Supabase aberto, ele pode criar lá.
    // Mas vou tentar usar uma manobra de RPC se estiver disponível.
    
    const sql = `
        CREATE TABLE IF NOT EXISTS equipamentos (
            selb TEXT PRIMARY KEY,
            modelo TEXT,
            descricao TEXT,
            updated_at TIMESTAMPTZ DEFAULT now()
        );
        ALTER TABLE equipamentos ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON equipamentos;
        CREATE POLICY "Permitir tudo para autenticados" ON equipamentos FOR ALL TO authenticated USING (true);
    `;

    // Nota: Normalmente o rpc('exec_sql') precisa ser habilitado no Supabase.
    // Se falhar, eu aviso o usuário para criar manualmente.
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
        console.error("❌ Erro ao criar tabela via RPC:", error.message);
        console.log("\n⚠️ AÇÃO REQUERIDA:");
        console.log("Por favor, execute o seguinte comando no SQL Editor do seu Dashboard Supabase:");
        console.log(sql);
    } else {
        console.log("✅ Tabela 'equipamentos' criada com sucesso!");
    }
}

createTable();

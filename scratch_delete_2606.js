import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixRevisados() {
    // Buscar quantos existem no dia 26/06/2026
    const { data: revs, error } = await supabase
        .from('revisados')
        .select('*')
        .gte('ts', '2026-06-26T00:00:00Z')
        .lte('ts', '2026-06-26T23:59:59Z');

    if (error) {
        console.error("Erro ao buscar:", error);
        return;
    }

    console.log(`Encontrados ${revs.length} registros para o dia 26/06/2026.`);
    
    if (revs.length > 0) {
        console.table(revs.slice(0, 5));
        
        // Deletar os registros
        const { error: delError } = await supabase
            .from('revisados')
            .delete()
            .gte('ts', '2026-06-26T00:00:00Z')
            .lte('ts', '2026-06-26T23:59:59Z');
            
        if (delError) {
            console.error("Erro ao deletar:", delError);
        } else {
            console.log(`Registros do dia 26/06/2026 deletados com sucesso!`);
        }
    }
}

fixRevisados();

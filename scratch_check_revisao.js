import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAndDelRevisao() {
    console.log("Procurando na tabela historico_remanu por revision_id...");
    let { data: h1, error: e1 } = await supabase
        .from('historico_remanu')
        .select('*')
        .eq('revision_id', 'REV-20260609-122316');
        
    if (e1) {
        console.error(e1);
        return;
    }
    
    console.log("Registros encontrados:", h1.length);
    
    if (h1 && h1.length > 0) {
        console.table(h1);
        
        console.log("Deletando registro...");
        let { error: e2 } = await supabase
            .from('historico_remanu')
            .delete()
            .eq('revision_id', 'REV-20260609-122316');
            
        if (e2) {
            console.error("Erro ao deletar:", e2);
        } else {
            console.log("Registro deletado com sucesso.");
        }
    }
}

checkAndDelRevisao();

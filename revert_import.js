import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function revertImport() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    // Deletar os equipamentos importados/alterados hoje
    const { data, error } = await supabase
        .from('equipamentos')
        .delete()
        .gte('updated_at', startOfDay.toISOString())
        .select();

    if (error) {
        console.error("Erro ao reverter:", error);
    } else {
        console.log(`✅ Sucesso! ${data.length} equipamentos errados da importação de hoje foram deletados.`);
    }
}

revertImport();

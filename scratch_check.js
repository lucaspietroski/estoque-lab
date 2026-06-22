import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRecentImports() {
    // Get count of items updated today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const { data: recent, count: recentCount, error: err2 } = await supabase
        .from('equipamentos')
        .select('*', { count: 'exact' })
        .gte('updated_at', startOfDay.toISOString())
        .order('updated_at', { ascending: false });

    console.log(`Equipamentos alterados/importados hoje: ${recentCount}`);
    
    if (recent && recent.length > 0) {
        console.log("Exemplos dos importados mais recentemente:");
        console.table(recent.slice(0, 10)); // max 10
        
        // Check for the specific issue: where modelo == descricao
        const badImports = recent.filter(r => r.modelo === r.descricao || r.descricao === 'IMPORTAÇÃO MASSIVA' || r.modelo.length < 15);
        console.log(`\nEncontrados ${badImports.length} equipamentos possivelmente errados (modelo curto ou igual descricao).`);
        console.table(badImports.slice(0, 10));
    }
}

checkRecentImports();

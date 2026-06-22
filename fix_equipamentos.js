import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixEquipamentos() {
    const workbook = xlsx.readFile('Export (18) (1).xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    console.log(`Lendo ${data.length - 1} registros do arquivo...`);

    let successCount = 0;
    let errorCount = 0;

    // Process in batches to avoid overwhelming the API
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 3) continue;

        const selb = row[0]; // SELB
        const produto = row[2]; // Produto Correto (Modelo)

        if (!selb || !produto) continue;

        const { error } = await supabase
            .from('equipamentos')
            .update({ modelo: produto })
            .eq('selb', selb);

        if (error) {
            console.error(`Erro ao atualizar ${selb}:`, error.message);
            errorCount++;
        } else {
            successCount++;
        }

        if (i % 100 === 0) {
            console.log(`Progresso: ${i}/${data.length - 1}`);
        }
    }

    console.log(`\n✅ Correção concluída!`);
    console.log(`Sucesso: ${successCount} equipamentos atualizados com o modelo correto.`);
    console.log(`Erros: ${errorCount}`);
}

fixEquipamentos().catch(console.error);

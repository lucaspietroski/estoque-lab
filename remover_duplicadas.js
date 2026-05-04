import { createClient } from "@supabase/supabase-js";

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function removerDuplicadas() {
    console.log('🧹 Iniciando limpeza de registros duplicados...');

    // Busca TODOS os registros sem limite
    let allRecords = [];
    let fetchLimit = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase.from('historico')
            .select('*')
            .order('ts', { ascending: true })
            .range(offset, offset + fetchLimit - 1);
            
        if (error) {
            console.error('Erro na busca:', error);
            return;
        }

        if (data && data.length > 0) {
            allRecords.push(...data);
            offset += fetchLimit;
            if (data.length < fetchLimit) hasMore = false;
        } else {
            hasMore = false;
        }
    }

    console.log(`📊 Total de registros encontrados no Supabase: ${allRecords.length}`);

    const seen = new Set();
    const toDelete = [];

    // Odena por data (mais antigos primeiro). O que aparecer depois igual, é deletado.
    for (const r of allRecords) {
        // Arredondar o tempo para o segundo exato para cobrir pequenas diferenças de milisegundos
        const t = new Date(r.ts).getTime();
        const roundedTime = Math.floor(t / 1000); 

        // Checar até 2 segundos de diferença (pra ter certeza absoluta)
        let found = false;
        for (let i = -2; i <= 2; i++) {
            const key = `${r.code}_${r.tipo}_${r.qty}_${roundedTime + i}`;
            if (seen.has(key)) {
                found = true;
                break;
            }
        }

        if (found) {
            toDelete.push(r.id);
        } else {
            seen.add(`${r.code}_${r.tipo}_${r.qty}_${roundedTime}`);
        }
    }

    console.log(`🔍 Encontradas ${toDelete.length} duplicatas exatas.`);

    if (toDelete.length > 0) {
        console.log('🗑️ Apagando...');
        const chunkSize = 200;
        let deleted = 0;
        
        for (let i = 0; i < toDelete.length; i += chunkSize) {
            const chunk = toDelete.slice(i, i + chunkSize);
            const { error } = await supabase.from('historico').delete().in('id', chunk);
            if (error) {
                console.error('Erro ao deletar:', error);
            } else {
                deleted += chunk.length;
            }
        }
        console.log(`✅ ${deleted} duplicatas removidas com sucesso!`);
    } else {
        console.log('✨ Nenhuma duplicata encontrada.');
    }
}

removerDuplicadas();

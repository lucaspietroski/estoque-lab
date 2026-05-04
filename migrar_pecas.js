import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuração para emular o __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURAÇÕES (Usando Service Role para garantir a migração)
const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';

console.log('🔗 Conectando com Service Role Key...');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrar() {
    try {
        const indexPath = path.join(__dirname, '..', 'ESTOQUE LAB', 'public', 'index.html');
        console.log('📂 Lendo arquivo original:', indexPath);
        
        if (!fs.existsSync(indexPath)) {
            console.error(`❌ Erro: Arquivo não encontrado em ${indexPath}`);
            return;
        }

        const html = fs.readFileSync(indexPath, 'utf8');

        console.log('🚀 Extraindo array RAW...');
        // Regex aprimorada para capturar o array RAW mesmo que seja muito grande
        const match = html.match(/const RAW = (\[[\s\S]*?\]);/);
        
        if (!match) {
            console.error('❌ Não foi possível encontrar o array RAW no index.html');
            return;
        }

        // Converter string para objeto JS usando Function
        const parts = new Function(`return ${match[1]}`)();
        console.log(`📦 Total de registros encontrados no arquivo: ${parts.length}`);

        // Mapear considerando o formato [código, descrição, marca, modelo...]
        const mappedParts = parts
            .filter(p => Array.isArray(p) && p[0]) // Garante que é um array e tem código
            .map(p => ({
                code: String(p[0]).trim(),
                descricao: p[1] || 'Sem descrição',
                marca: p[2] || null,
                modelo_pattern: p[3] || null
            }));

        console.log(`🧹 Peças válidas para envio: ${mappedParts.length}`);

        if (mappedParts.length === 0) {
            console.error('❌ Nenhuma peça válida encontrada após o mapeamento. Verifique o formato do array RAW.');
            return;
        }

        console.log('📤 Enviando para o Supabase (lotes de 500)...');
        const batchSize = 500;
        let totalEnviado = 0;

        for (let i = 0; i < mappedParts.length; i += batchSize) {
            const batch = mappedParts.slice(i, i + batchSize);
            const { error } = await supabase
                .from('parts')
                .upsert(batch, { onConflict: 'code' });

            if (error) {
                console.error(`❌ Erro no lote ${Math.floor(i/batchSize) + 1}:`, error.message);
                // Se houver erro de foreign key ou algo assim, continuamos para os próximos lotes
            } else {
                totalEnviado += batch.length;
                if (Math.floor(i/batchSize) % 5 === 0 || i + batchSize >= mappedParts.length) {
                    console.log(`✅ Progresso: ${totalEnviado}/${mappedParts.length} peças enviadas...`);
                }
            }
        }

        console.log('\n✨ MIGRACÃO CONCLUÍDA!');
        console.log(`📊 Total final processado: ${totalEnviado} peças.`);
        console.log('💡 Dica: Agora dê F5 no seu sistema para ver os dados!');

    } catch (err) {
        console.error('❌ Erro fatal:', err.message);
        console.error(err.stack);
    }
}

migrar();

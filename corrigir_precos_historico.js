import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function patchPrices() {
    console.log("🔍 Iniciando correção de preços no histórico...");

    // 1. Puxar todos os custos atuais para referência
    const { data: custos, error: errC } = await supabase.from('custos').select('code, last_cost');
    if (errC) { console.error("Erro custos:", errC); return; }
    
    const precoMap = {};
    custos.forEach(c => { precoMap[c.code] = c.last_cost; });
    console.log(`✅ ${custos.length} preços carregados para referência.`);

    // 2. Puxar histórico que está sem preço ou com preço zerado
    const { data: historico, error: errH } = await supabase.from('historico')
        .select('id, code, qty, vlr_unit, vlr_total')
        .or('vlr_unit.eq.0,vlr_unit.is.null,vlr_total.eq.0,vlr_total.is.null');

    if (errH) { console.error("Erro histórico:", errH); return; }
    console.log(`📡 Encontrados ${historico.length} registros de histórico para analisar/corrigir.`);

    let corrigidos = 0;
    for (const item of historico) {
        const precoAtual = precoMap[item.code];
        if (precoAtual && precoAtual > 0) {
            const novoVlrUnit = precoAtual;
            const novoVlrTotal = precoAtual * item.qty;

            // Só atualiza se o valor for realmente diferente ou estiver zerado
            if (item.vlr_unit !== novoVlrUnit || item.vlr_total !== novoVlrTotal) {
                const { error: errU } = await supabase.from('historico')
                    .update({ vlr_unit: novoVlrUnit, vlr_total: novoVlrTotal })
                    .eq('id', item.id);
                
                if (!errU) corrigidos++;
            }
        }
    }

    console.log(`\n🎉 FIM! ${corrigidos} registros de histórico foram corrigidos com os preços do banco de dados.`);
    console.log("Pode dar F5 no sistema e conferir a aba de Histórico.");
}

patchPrices();

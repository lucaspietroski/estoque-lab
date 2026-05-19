import { createClient } from "@supabase/supabase-js";

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjU2NjcsImV4cCI6MjA5MzI0MTY2N30.L4hV7YM9yjdOOW9zBl84L-1si2DU8nBI3J1WgmW02lY';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
    console.log("--- Querying ESTOQUE ---");
    const { data: stockData, error: stockErr } = await supabase
        .from('estoque')
        .select('*')
        .eq('code', '302LV94270');
    console.log('Stock:', stockData, stockErr);

    console.log("--- Querying HISTORICO ---");
    const { data: histData, error: histErr } = await supabase
        .from('historico')
        .select('*')
        .eq('code', '302LV94270')
        .order('ts', { ascending: true });
    
    if (histData) {
        histData.forEach((row, i) => {
            console.log(`[${i}] ID: ${row.id} | TS: ${row.ts} | Tipo: ${row.tipo} | Qty: ${row.qty} | Desc: ${row.descricao || row.selb}`);
        });
    } else {
        console.log('Hist Error:', histErr);
    }
}
check();

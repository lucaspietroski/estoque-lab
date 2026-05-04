import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
    const { data, error } = await supabase.from('estoque').select('*');
    if (error) {
        console.error('Erro:', error);
        return;
    }
    console.log(`Total rows in estoque: ${data.length}`);
    
    let pos = 0, zero = 0, neg = 0, nulls = 0;
    data.forEach(r => {
        if (r.qty > 0) pos++;
        else if (r.qty === 0) zero++;
        else if (r.qty < 0) neg++;
        else nulls++;
    });

    console.log(`Positivos (>0): ${pos}`);
    console.log(`Zeros (==0): ${zero}`);
    console.log(`Negativos (<0): ${neg}`);
    console.log(`Nulos ou Inválidos: ${nulls}`);
    
    // Mostra os que são nulos ou invalidos
    if (nulls > 0) {
        console.log("Amostra de nulos:", data.filter(r => r.qty !== 0 && !(r.qty > 0) && !(r.qty < 0)).slice(0, 10));
    }
    // Mostra os primeiros positivos
    if (pos > 0) {
        console.log("Amostra de positivos:", data.filter(r => r.qty > 0).slice(0, 10));
    }
}

check();

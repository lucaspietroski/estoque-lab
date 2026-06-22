import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjU2NjcsImV4cCI6MjA5MzI0MTY2N30.L4hV7YM9yjdOOW9zBl84L-1si2DU8nBI3J1WgmW02lY';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log("Fetching entradas...");
  // Let's get all entradas
  let allEntradas = [];
  let start = 0;
  const limit = 1000;
  
  while(true) {
    const { data, error } = await supabase.from('historico')
      .select('code, descricao, vlr_unit, ts')
      .eq('tipo', 'entrada')
      .range(start, start + limit - 1)
      .order('ts', { ascending: true });
      
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    
    allEntradas.push(...data);
    start += limit;
  }
  
  console.log(`Total entradas: ${allEntradas.length}`);
  
  const historyByCode = {};
  allEntradas.forEach(e => {
    if(!historyByCode[e.code]) historyByCode[e.code] = [];
    historyByCode[e.code].push(e);
  });
  
  let changedCount = 0;
  for (const code in historyByCode) {
    const records = historyByCode[code];
    const firstPrice = records[0].vlr_unit;
    const lastPrice = records[records.length - 1].vlr_unit;
    
    // Check if there is a significant change (e.g. > 1% diff or something)
    if (firstPrice !== lastPrice && firstPrice > 0) {
       changedCount++;
       if (changedCount <= 5) {
         console.log(`Code: ${code} - Desc: ${records[0].descricao}`);
         console.log(`First price: ${firstPrice} | Last price: ${lastPrice}`);
       }
    }
  }
  
  console.log(`Pieces with price changes: ${changedCount}`);
}
test();

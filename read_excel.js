import xlsx from 'xlsx';

const workbook = xlsx.readFile('Export (18) (1).xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Colunas encontradas:");
console.log(data[0]);

console.log("\nPrimeiras 5 linhas de dados:");
for (let i = 1; i < Math.min(6, data.length); i++) {
    console.log(data[i]);
}

console.log(`\nTotal de linhas (incluindo cabeçalho): ${data.length}`);

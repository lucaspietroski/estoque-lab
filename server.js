import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanProject } from './audit/inventory/scanProject.js';
import { analyzeFiles } from './audit/analyzers/fileAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors()); // Permite que o Vite chame o backend local

// Rota de Inventário da Auditoria
app.get('/api/audit/inventory', (req, res) => {
    try {
        const result = scanProject(__dirname);
        res.json(result);
    } catch (error) {
        console.error("Erro na auditoria:", error);
        res.status(500).json({ error: error.message });
    }
});

// Rota de Análise Profunda da Auditoria (Fase 2)
app.get('/api/audit/analyze', (req, res) => {
    try {
        const inventoryResult = scanProject(__dirname);
        const analysisResult = analyzeFiles(inventoryResult.inventory.files, __dirname);
        res.json(analysisResult);
    } catch (error) {
        console.error("Erro na análise:", error);
        res.status(500).json({ error: error.message });
    }
});
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🛡️  Audit Core Server rodando na porta ${PORT}`);
    console.log(`📍 Endpoint: http://localhost:${PORT}/api/audit/inventory`);
});

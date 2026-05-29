import fs from 'fs';
import path from 'path';

// Diretórios e arquivos a ignorar (otimização de memória)
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage', '.cache', '.vscode', '.idea'];
const BINARY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.exe', '.dll', '.zip', '.tar', '.gz', '.mp4', '.ico', '.woff', '.woff2'];

// Detectores sensíveis
const SENSITIVE_FILES = ['.env', 'package.json', 'supabase_schema.sql', 'firebird.conf', 'config.json'];

export function scanProject(rootDir) {
    const result = {
        inventory: {
            folders: [],
            files: []
        },
        technologies: {
            frontend: null,
            backend: null,
            database: null,
            hasDocker: false
        },
        riskIndicators: {
            sensitiveFiles: [],
            possibleSecrets: [],
            hasEnv: false,
            hasScripts: false
        }
    };

    function readDirectory(currentPath, relativePath = '') {
        let entries = [];
        try {
            entries = fs.readdirSync(currentPath, { withFileTypes: true });
        } catch (e) {
            console.error(`Erro ao ler diretório ${currentPath}:`, e.message);
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/');

            if (entry.isDirectory()) {
                if (IGNORE_DIRS.includes(entry.name)) continue;
                
                result.inventory.folders.push(relPath);
                readDirectory(fullPath, relPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                
                // Ignorar binários
                if (BINARY_EXTENSIONS.includes(ext)) continue;

                result.inventory.files.push(relPath);

                // --- DETECÇÕES DE TECNOLOGIA ---
                if (entry.name === 'vite.config.js' || entry.name === 'index.html') {
                    result.technologies.frontend = 'Vite/HTML';
                }
                if (entry.name === 'server.js' || entry.name === 'package.json') {
                    result.technologies.backend = 'Node.js';
                }
                if (entry.name.includes('supabase')) {
                    result.technologies.database = 'Supabase';
                }
                if (entry.name.includes('firebird')) {
                    result.technologies.database = 'Firebird';
                }
                if (entry.name === 'Dockerfile' || entry.name === 'docker-compose.yml') {
                    result.technologies.hasDocker = true;
                }

                // --- DETECÇÕES DE RISCO ---
                if (entry.name.includes('.env')) {
                    result.riskIndicators.hasEnv = true;
                }
                if (ext === '.sh' || ext === '.bat' || entry.name.includes('script')) {
                    result.riskIndicators.hasScripts = true;
                }
                if (SENSITIVE_FILES.includes(entry.name) || entry.name.endsWith('.key') || entry.name.endsWith('.pem')) {
                    result.riskIndicators.sensitiveFiles.push(relPath);
                }
            }
        }
    }

    readDirectory(rootDir);
    return result;
}

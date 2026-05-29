import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_EXTS = {
    FRONTEND: ['.html', '.css', '.js', '.jsx', '.ts', '.tsx'],
    BACKEND: ['.js', '.ts'],
    DATABASE: ['.sql'],
    CONFIG: ['.json', '.yaml', '.yml', '.env'],
    SCRIPT: ['.sh', '.bat', '.ps1']
};

export function analyzeFiles(filesList, rootDir) {
    const timestampStr = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const analysisId = `AUD-${timestampStr}`;
    
    const result = {
        analysisVersion: "2.1.1",
        generatedAt: new Date().toISOString(),
        analysisId: analysisId,
        stats: {
            totalAnalyzed: 0,
            categories: {
                frontend: 0,
                backend: 0,
                sql: 0,
                scripts: 0,
                configs: 0
            },
            findingsBySeverity: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                info: 0
            }
        },
        filesMetadata: [],
        findings: [],
        ignoredFindings: []
    };

    function addFinding(file, line, type, severity, confidence, snippet, sendToAI = false, reason = null) {
        const finding = {
            id: `FT-${crypto.randomBytes(3).toString('hex')}`,
            file,
            line,
            type,
            severity,
            confidence,
            snippet,
            sendToAI
        };
        if (reason) finding.reason = reason;
        
        result.findings.push(finding);
        result.stats.findingsBySeverity[severity]++;
    }

    function addIgnoredFinding(file, reason) {
        result.ignoredFindings.push({ file, reason });
    }

    for (const relPath of filesList) {
        const fullPath = path.join(rootDir, relPath);
        if (!fs.existsSync(fullPath)) continue;

        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        const ext = path.extname(relPath).toLowerCase();
        const baseName = path.basename(relPath).toLowerCase();
        
        let category = 'UNKNOWN';
        if (ALLOWED_EXTS.FRONTEND.includes(ext)) category = 'frontend';
        if (ALLOWED_EXTS.DATABASE.includes(ext)) category = 'sql';
        if (ALLOWED_EXTS.CONFIG.includes(ext)) category = 'configs';
        if (ALLOWED_EXTS.SCRIPT.includes(ext)) category = 'scripts';
        
        // Heurística básica frontend vs backend
        if (ext === '.js' || ext === '.ts') {
            if (relPath.includes('backend') || relPath.includes('server') || relPath.includes('api') || relPath.includes('routes') || relPath.includes('audit')) {
                category = 'backend';
            } else if (category === 'UNKNOWN') {
                category = 'frontend';
            }
        }
        
        if (category === 'UNKNOWN') continue;

        result.stats.categories[category]++;
        result.stats.totalAnalyzed++;

        // Big file check
        if (stat.size > 10 * 1024 * 1024) {
            addFinding(relPath, 0, 'large_file', 'high', 'high', `File size is ${(stat.size/1024/1024).toFixed(2)}MB`, true);
        } else if (stat.size > 2 * 1024 * 1024) {
            addFinding(relPath, 0, 'large_file', 'medium', 'high', `File size is ${(stat.size/1024/1024).toFixed(2)}MB`, true);
        } else if (stat.size > 500 * 1024) {
            addFinding(relPath, 0, 'large_file', 'low', 'high', `File size is ${(stat.size/1024).toFixed(0)}KB`, false);
        }

        // Pular arquivos enormes para análise de regex para evitar OOM
        if (stat.size > 5 * 1024 * 1024) {
            result.filesMetadata.push({ path: relPath, category, size: stat.size, hash: 'TOO_LARGE' });
            continue;
        }
        
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Calcula Hash
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
        const lines = content.split(/\r?\n/);

        result.filesMetadata.push({ path: relPath, category, size: stat.size, lines: lines.length, hash });

        const isDependencyFile = baseName === 'package.json' || baseName.includes('lock');
        
        // Regexes
        const secretRegex = /((?:API_KEY|TOKEN|PASSWORD|SECRET|SUPABASE_KEY|SERVICE_ROLE_KEY))\s*[:=]\s*(['"`])([^'"`]+)\2/ig;
        const dbRegex = /postgres|supabase|mysql|firebird/i;
        
        // Verifica dependency reference em package.json/lock
        if (isDependencyFile) {
            addIgnoredFinding(relPath, 'dependency_lockfile_db_check_skipped');
            if (content.includes('@supabase') || content.includes('supabase-js')) {
                addFinding(relPath, 0, 'dependency_reference', 'info', 'high', 'Supabase SDK Reference', false, 'framework_reference');
            }
            continue; // Pular análise linha a linha pesada
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check Secrets
            let match;
            secretRegex.lastIndex = 0;
            while ((match = secretRegex.exec(line)) !== null) {
                // Ignore context UI/DOM
                if (/(getElementById|querySelector|console\.log|_FIELD|_INPUT|_LABEL)/i.test(line)) continue;
                
                const key = match[1].toUpperCase();
                const value = match[3];
                let snippetMasked = line.trim();
                snippetMasked = snippetMasked.replace(value, '********');
                if (snippetMasked.length > 120) snippetMasked = snippetMasked.substring(0, 120) + '...';
                
                if (key === 'SERVICE_ROLE_KEY' && value.length > 30) {
                    addFinding(relPath, i + 1, 'possible_service_role_key', 'critical', 'medium', snippetMasked, true, 'service_role_key_detected');
                } else if (key !== 'SERVICE_ROLE_KEY') {
                    addFinding(relPath, i + 1, 'possible_secret', 'high', 'high', snippetMasked, true);
                }
            }
            
            // Check DB connections (evitando .html/.css)
            if (category !== 'frontend' && dbRegex.test(line)) {
                if (line.includes('://') || line.includes('require(') || line.includes('import ') || line.includes('createClient')) {
                   let snippet = line.trim();
                   if (snippet.length > 120) snippet = snippet.substring(0, 120) + '...';
                   addFinding(relPath, i + 1, 'database_connection', 'medium', 'medium', snippet, false);
                }
            }
        }
    }

    return result;
}

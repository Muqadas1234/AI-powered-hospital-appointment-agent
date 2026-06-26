import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const PROMPT_PATH = path.join(ROOT, 'vapi', 'assistant_prompt.txt');
const TOOLS_PATH = path.join(ROOT, 'vapi', 'tools.json');
const ENV_PATH = path.join(ROOT, '.env');
const VAPI_API_BASE = 'https://api.vapi.ai';

function loadEnv() {
    if (fs.existsSync(ENV_PATH)) {
        const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                const key = match[1];
                let value = match[2] || '';
                value = value.replace(/^['"](.*)['"]$/, '$1').trim();
                process.env[key] = value;
            }
        });
    }
}

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing required env var: ${name}`);
        process.exit(1);
    }
    return value;
}

function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
}

async function detectNgrokUrl() {
    let configured = (process.env.VAPI_NGROK_URL || '').replace(/\/$/, '');
    if (configured && configured.toLowerCase() !== 'auto') {
        return configured;
    }
    try {
        const data = await fetchJson('http://127.0.0.1:4040/api/tunnels');
        const httpsUrls = data.tunnels
            .map(t => t.public_url.replace(/\/$/, ''))
            .filter(url => url.startsWith('https://'));
        
        if (httpsUrls.length > 0) return httpsUrls[0];
    } catch (e) {
        // ignore
    }
    // Fallback to Next.js public URL if available
    const pubUrl = process.env.PUBLIC_BASE_URL || '';
    if (pubUrl && pubUrl.startsWith('https://')) return pubUrl;

    console.error("Could not detect ngrok URL or PUBLIC_BASE_URL. Please set PUBLIC_BASE_URL to your public https URL in .env.");
    process.exit(1);
}

function loadTools(ngrokUrl) {
    const toolApiKey = process.env.TOOL_API_KEY || '';
    const tools = JSON.parse(fs.readFileSync(TOOLS_PATH, 'utf-8'));
    const syncedTools = [];

    for (const tool of tools) {
        const current = { ...tool };
        const url = current.url;
        if (url.includes('/api/v1/')) {
            const suffix = url.split('/api/v1/')[1];
            current.url = `${ngrokUrl}/api/v1/${suffix}`;
        } else {
            current.url = ngrokUrl;
        }

        const rawHeaders = { ...(current.headers || {}) };
        rawHeaders['ngrok-skip-browser-warning'] = 'true';
        if (toolApiKey) {
            rawHeaders['x-tool-api-key'] = toolApiKey;
        } else {
            delete rawHeaders['x-tool-api-key'];
        }

        const headersSchema = {
            type: "object",
            properties: {}
        };
        for (const [k, v] of Object.entries(rawHeaders)) {
            headersSchema.properties[k] = { type: "string", default: String(v) };
        }

        let toolBodySchema = undefined;
        const method = (current.method || "GET").toUpperCase();
        if (method !== "GET") {
            toolBodySchema = current.parameters || { type: "object" };
        }

        const apiRequestTool = {
            type: "apiRequest",
            name: current.name,
            description: current.description || "",
            method: method,
            url: current.url,
            headers: headersSchema,
        };
        if (toolBodySchema) {
            apiRequestTool.body = toolBodySchema;
        }

        syncedTools.push(apiRequestTool);
    }
    return syncedTools;
}

async function main() {
    loadEnv();
    const apiKey = requireEnv('VAPI_PRIVATE_API_KEY');
    const assistantId = requireEnv('VAPI_ASSISTANT_ID');
    const ngrokUrl = await detectNgrokUrl();
    const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8').trim();
    const tools = loadTools(ngrokUrl);

    console.log('Fetching assistant data...');
    const assistant = await fetchJson(`${VAPI_API_BASE}/assistant/${assistantId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const model = assistant.model || {};
    model.messages = [{ role: 'system', content: prompt }];
    model.tools = tools;
    delete model.toolIds;

    let firstMessage = process.env.VAPI_FIRST_MESSAGE || '';
    if (!firstMessage) {
        firstMessage = "Assalamualaikum, welcome to our hospital helpline. I'm here to help you book or manage appointments. How may I assist you today?";
    }

    const payload = {
        model: model,
        firstMessage: firstMessage
    };

    console.log('Updating assistant on VAPI...');
    const updated = await fetchJson(`${VAPI_API_BASE}/assistant/${assistantId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: payload
    });

    console.log("Vapi assistant updated successfully.");
    console.log("Assistant ID:", updated.id || assistantId);
    console.log("Synced tools:", tools.map(t => t.name).join(", "));
    console.log("Ngrok URL:", ngrokUrl);
}

main().catch(err => {
    console.error("Error updating VAPI:", err.message);
    process.exit(1);
});


import { globals } from '../../common/globals.mjs';
import { Utils } from '../../common/utils.mjs';
import { XAIProvider } from '../../plugins/agent/models/providers/xai.mjs';
import { CopilotProvider } from '../../plugins/agent/models/providers/copilot.mjs';
import { OllamaProvider } from '../../plugins/agent/models/providers/ollama.mjs';
import fs from 'fs';
import path from 'path';

// Mock globals.getConfig
globals.getConfig = (key) => {
    if (key === 'aiProviders.xai') return { apiKey: process.env.XAI_API_KEY };
    if (key === 'aiProviders.ollama') return { baseUrl: 'http://localhost:11434' };
    if (key === 'aiProviders.copilot') return {}; // Copilot uses .tokens.yaml
    return null;
};

// Mock Utils.log*
Utils.logInfo = console.log;
Utils.logError = console.error;
Utils.logWarn = console.warn;
Utils.logDebug = console.debug;
Utils.logTrace = () => {};

async function testProvider(name, providerClass, model) {
    console.log(`\n--- Testing ${name} (${model}) ---`);
    try {
        const provider = new providerClass();
        await provider.init();

        const messages = [{ role: 'user', content: 'Hello, just say "hi".' }];
        const response = await provider.createChatCompletion({
            model,
            messages,
            max_tokens: 10
        });

        console.log('Response Usage:', JSON.stringify(response.usage, null, 2));
        
        if (!response.usage) {
            console.error('❌ No usage data returned!');
        } else {
            console.log('✅ Usage data received.');
        }
        return response.usage;
    } catch (e) {
        console.error(`❌ Error testing ${name}:`, e.message);
        return null;
    }
}

async function run() {
    console.log('Starting Provider Metrics Validation...');

    // Test Ollama
    await testProvider('Ollama', OllamaProvider, 'qwen3:8b');

    // Test xAI (if key exists)
    if (process.env.XAI_API_KEY) {
        await testProvider('xAI', XAIProvider, 'grok-4-fast-reasoning');
    } else {
        console.log('\n--- Skipping xAI (no API key) ---');
    }

    // Test Copilot (if tokens exist)
    const tokensPath = path.join(process.cwd(), '.tokens.yaml');
    if (fs.existsSync(tokensPath)) {
        await testProvider('Copilot', CopilotProvider, 'claude-sonnet-4.5');
    } else {
        console.log('\n--- Skipping Copilot (no .tokens.yaml) ---');
    }
}

run();

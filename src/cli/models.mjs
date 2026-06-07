/**
 * Models CLI Command
 * 
 * Handles the `d models` subcommand for listing available AI models
 */

import { log } from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handleModelsCommand(args, format) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  const { registry } = await import('../lib/ai-providers/registry.mjs');
  log('info', '🔍 Listing available models from all configured providers...\n');

  const results = await registry.listAllModels();

  // Format output based on requested format
  if (format === 'json') {
    console.log(JSON.stringify(results, null, 2));
  } else if (format === 'yaml') {
    const yaml = await import('js-yaml');
    console.log(yaml.dump(results));
  } else {
    // Table format (default)
    for (const providerResult of results) {
      const statusIcon = providerResult.configured ? '✅' : '❌';
      console.log(`\n${statusIcon} ${color.bold(providerResult.provider.toUpperCase())}`);

      if (!providerResult.configured) {
        console.log(`   ${color.yellow('Not configured - missing API key or configuration')}`);
      } else if (providerResult.error) {
        console.log(`   ${color.red('Error: ' + providerResult.error)}`);
      } else if (providerResult.models.length === 0) {
        console.log(`   ${color.gray('No models available')}`);
      } else {
        console.log(`   ${color.gray(`${providerResult.count} models available:`)}`);
        for (const model of providerResult.models) {
          console.log(`   • ${color.cyan(model.id)} - ${model.description || model.name}`);
        }
      }
    }
    console.log('');
  }

  process.exit(0);
}

function showHelp() {
  console.log(`${color.bold('d models')} - List available AI models

Usage: d models [options]

Description:
  Lists all available AI models from all configured providers. Shows which
  providers are configured (have API keys) and what models they offer.

  Supported providers:
  - GitHub Copilot (claude-sonnet-4, gpt-4o, o1-preview, o1-mini)
  - xAI (grok-code-fast-1, grok-beta)
  - Google Gemini (gemini-2.0-flash-exp, gemini-1.5-pro)
  - Ollama (qwen3:8b, llama3.3, mistral, codellama, etc.)
  - Anthropic (claude-sonnet-4.5, claude-opus-4)
  - OpenAI (gpt-5, gpt-4.5, o1)
  - Z.ai (GLM-4, GLM-3)

Options:
  --format <format>   Output format: table (default), json, yaml

Examples:
  d models                    # List all models in table format
  d models --format json      # List all models as JSON
  d models --format yaml      # List all models as YAML
`);
}

import { globals } from '../../common/globals.mjs';
import { Utils } from '../../common/utils.mjs';
import { toolsDefinition } from './tools.mjs';
import * as controller from './controller.mjs';

export class GeminiPlugin {
  constructor() {
    globals.pluginsRegistry.set('gemini', this);
    this.registerTools();
  }

  registerTools() {
    globals.dslRegistry.set('gemini__image__generate', this.generateImage.bind(this));
  }

  get definition() {
    return toolsDefinition;
  }

  async generateImage(args) {
    // Handle both object args and string args (if simplified)
    let params = args;
    if (typeof args === 'string') {
        params = { prompt: args };
    } else if (Array.isArray(args)) {
        // Map positional arguments to named parameters
        params = {
            prompt: args[0],
            mode: args[1],
            input_image_urls: args[2] ? (typeof args[2] === 'string' ? [args[2]] : args[2]) : undefined,
            aspect_ratio: args[3],
            output_dir: args[4],
            response_mode: args[5]
        };
    }
    
    return await controller.generateImage(params);
  }
}

export const geminiPlugin = new GeminiPlugin();

import { globals } from '../../common/globals.mjs';
import { Utils } from '../../common/utils.mjs';
import { parseArg, toYaml } from '../../common/yaml-db.mjs';
import { toolsDefinition } from './tools.mjs';
import { ToolExecutionStatus } from '../agent/controllers/host-container-bridge.mjs';
import * as controller from './controller.mjs';

// Helper to parse batch argument - wraps single object in array
function parseBatch(arg) {
  if (!arg) return [];
  const parsed = typeof arg === 'string' ? parseArg(arg) : arg;
  // If single object, wrap in array
  return Array.isArray(parsed) ? parsed : [parsed];
}

export class VectorDbPlugin {
  constructor() {
    globals.pluginsRegistry.set('vectordb', this);
    this.registerTools();
  }

  registerTools() {
    globals.dslRegistry.set('vectordb__recall', this.recall.bind(this));
    globals.dslRegistry.set('vectordb__memorize', this.memorize.bind(this));
    globals.dslRegistry.set('vectordb__forget', this.forget.bind(this));
  }

  get definition() {
    return toolsDefinition;
  }

  async recall(args) { 
    Utils.logInfo('vectordb.recall called');
    let params = args;
    if (Array.isArray(args)) {
      params = {
        file: args[0],
        batch: parseBatch(args[1])
      };
    }
    try {
      const result = await controller.recall(params);
      const yamlResult = toYaml(result);
      Utils.logInfo(`Recall result:\n${yamlResult}`);
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: yamlResult
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }

  async memorize(args) { 
    Utils.logInfo('vectordb.memorize called');
    let params = args;
    if (Array.isArray(args)) {
      params = {
        file: args[0],
        batch: parseBatch(args[1])
      };
    }
    try {
      const result = await controller.memorize(params);
      Utils.logInfo(`Memorize result:\n${JSON.stringify(result, null, 2)}`);
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result, null, 2)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }

  async forget(args) { 
    Utils.logInfo('vectordb.forget called');
    let params = args;
    if (Array.isArray(args)) {
      params = {
        file: args[0],
        batch: parseBatch(args[1])
      };
    }
    try {
      const result = await controller.forget(params);
      Utils.logInfo(`Forget result:\n${JSON.stringify(result, null, 2)}`);
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result, null, 2)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }
}

export const vectorDbPlugin = new VectorDbPlugin();

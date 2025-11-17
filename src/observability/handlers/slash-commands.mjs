// Slash command processor
export class SlashCommands {
  constructor(channelHandlers, agentHandlers) {
    this.channelHandlers = channelHandlers;
    this.agentHandlers = agentHandlers;
  }

  async handle(ws, msg) {
    const { command, channel, args } = msg;
    
    switch (command) {
      case 'join':
        await this.handleJoin(ws, args);
        break;

      case 'part':
        await this.handlePart(ws, channel);
        break;

      case 'invite':
        await this.handleInvite(ws, channel, args);
        break;

      default:
        throw new Error(`Unknown slash command: ${command}`);
    }
  }

  async handleJoin(ws, args) {
    if (!args || args.length === 0) {
      throw new Error('Channel name is required');
    }

    await this.channelHandlers.handleCreate(ws, { name: args[0] });
  }

  async handlePart(ws, channel) {
    if (!channel) {
      throw new Error('Must specify channel to leave');
    }

    await this.channelHandlers.handleDelete(ws, { name: channel });
  }

  async handleInvite(ws, channel, args) {
    if (!channel) {
      throw new Error('Must be in a channel to invite agents');
    }

    if (!args || args.length === 0) {
      throw new Error('Agent template is required');
    }

    // Parse @template
    const template = args[0].startsWith('@') ? args[0].slice(1) : args[0];
    const prompt = args.slice(1).join(' ') || 'Hello';
    
    await this.agentHandlers.handleInvite(ws, { channel, template, prompt });
  }
}

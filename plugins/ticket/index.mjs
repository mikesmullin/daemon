import { globals } from '../../common/globals.mjs';
import { Utils } from '../../common/utils.mjs';
import { toolsDefinition } from './tools.mjs';
import { ToolExecutionStatus } from '../agent/controllers/host-container-bridge.mjs';
import * as controller from './controller.mjs';

export class TicketPlugin {
  constructor() {
    globals.pluginsRegistry.set('ticket', this);
    this.registerTools();
    this.registerWidgets();
  }

  registerTools() {
    globals.dslRegistry.set('ticket__create', this.createTicket.bind(this));
    globals.dslRegistry.set('ticket__detail', this.getTicket.bind(this));
    globals.dslRegistry.set('ticket__update', this.updateTicket.bind(this));
    globals.dslRegistry.set('ticket__delete', this.deleteTicket.bind(this));
    globals.dslRegistry.set('ticket__comment__add', this.addComment.bind(this));
    globals.dslRegistry.set('ticket__comments__list', this.getComments.bind(this));
    globals.dslRegistry.set('tickets__list', this.listTickets.bind(this));
    globals.dslRegistry.set('ticket__history__list', this.getTicketHistory.bind(this));
  }

  registerWidgets() {
    // Widget: ticket.summary - Shows ticket summary
    globals.widgetRegistry.set('ticket.summary', {
      plugin: 'ticket',
      render: async () => {
        try {
          const tickets = await controller.listTickets({});
          const total = tickets.length;
          const open = tickets.filter(t => t.status === 'open').length;
          const inProgress = tickets.filter(t => t.status === 'in-progress').length;
          const closed = tickets.filter(t => t.status === 'closed').length;
          
          return `┌─ Tickets ─────────────────┐
│ Total: ${String(total).padEnd(18)}│
│ Open: ${String(open).padEnd(19)}│
│ In Progress: ${String(inProgress).padEnd(12)}│
│ Closed: ${String(closed).padEnd(17)}│
└───────────────────────────┘`;
        } catch (e) {
          return `┌─ Tickets ─────────────────┐\n│ (error loading tickets)  │\n└───────────────────────────┘`;
        }
      }
    });
  }

  get definition() {
    return toolsDefinition;
  }

  async createTicket(args) { 
    const params = Array.isArray(args) ? { title: args[0], description: args[1], changedBy: 'agent' } : { ...args, changedBy: args.changedBy || 'agent' };
    try {
      const result = await controller.createTicket(params);
      Utils.logInfo(JSON.stringify(result));
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }

  async getTicket(args) { 
    const params = Array.isArray(args) ? { id: args[0] } : args;
    try {
      const result = await controller.getTicket(params);
      Utils.logInfo(JSON.stringify(result));
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }

  async updateTicket(args) { 
    const params = Array.isArray(args) ? { id: args[0], updates: args[1], changedBy: 'agent' } : { ...args, changedBy: args.changedBy || 'agent' };
    try {
      const result = await controller.updateTicket(params);
      Utils.logInfo(JSON.stringify(result));
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }

  async deleteTicket(args) { 
    const params = Array.isArray(args) ? { id: args[0], changedBy: 'agent' } : { ...args, changedBy: args.changedBy || 'agent' };
    try {
      const result = await controller.deleteTicket(params);
      Utils.logInfo(JSON.stringify(result));
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }

  async addComment(args) { 
    const params = Array.isArray(args) ? { ticketId: args[0], content: args[1], author: 'agent' } : { ...args, author: args.author || 'agent' };
    try {
      const result = await controller.addComment(params);
      Utils.logInfo(JSON.stringify(result));
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }

  async getComments(args) { 
    const params = Array.isArray(args) ? { ticketId: args[0] } : args;
    try {
      const result = await controller.getComments(params);
      Utils.logInfo(JSON.stringify(result));
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }

  async listTickets(args) { 
    const params = Array.isArray(args) ? {} : args;
    try {
      const result = await controller.listTickets(params);
      Utils.logInfo(JSON.stringify(result));
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }

  async getTicketHistory(args) {
    const params = Array.isArray(args) ? { ticketId: args[0] } : args;
    try {
      const result = await controller.getTicketHistory(params);
      Utils.logInfo(JSON.stringify(result));
      return {
        status: ToolExecutionStatus.SUCCESS,
        result: JSON.stringify(result)
      };
    } catch (e) {
      return {
        status: ToolExecutionStatus.FAILURE,
        error: e.message
      };
    }
  }
}

export const ticketPlugin = new TicketPlugin();

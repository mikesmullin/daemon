export const toolsDefinition = [
  {
    type: "function",
    function: {
      name: "ticket__create",
      description: "Create a new ticket",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string" }
        },
        required: ["title", "description"]
      }
    },
    metadata: {
      help: "ticket create <title> <description> [priority]"
    }
  },
  {
    type: "function",
    function: {
      name: "ticket__detail",
      description: "Get ticket details",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"]
      }
    },
    metadata: {
      help: "ticket detail <id>"
    }
  },
  {
    type: "function",
    function: {
      name: "ticket__update",
      description: "Update a ticket",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string" },
          priority: { type: "string" }
        },
        required: ["id"]
      }
    },
    metadata: {
      help: "ticket update <id> [status] [priority]"
    }
  },
  {
    type: "function",
    function: {
      name: "ticket__delete",
      description: "Delete a ticket",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"]
      }
    },
    metadata: {
      help: "ticket delete <id>"
    }
  },
  {
    type: "function",
    function: {
      name: "ticket__comment__add",
      description: "Add a comment to a ticket",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          comment: { type: "string" }
        },
        required: ["id", "comment"]
      }
    },
    metadata: {
      help: "ticket comment add <id> <comment>"
    }
  },
  {
    type: "function",
    function: {
      name: "ticket__comments__list",
      description: "List comments for a ticket",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"]
      }
    },
    metadata: {
      help: "ticket comments list <id>"
    }
  },
  {
    type: "function",
    function: {
      name: "tickets__list",
      description: "List all tickets",
      parameters: {
        type: "object",
        properties: { status: { type: "string" } }
      }
    },
    metadata: {
      help: "tickets list [status]"
    }
  },
  {
    type: "function",
    function: {
      name: "ticket__history__list",
      description: "Get ticket history",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"]
      }
    },
    metadata: {
      help: "ticket history list <id>"
    }
  }
];

export const toolsDefinition = [
  {
    type: "function",
    function: {
      name: "youtube__video__detail",
      description: "Get details of a YouTube video",
      parameters: {
        type: "object",
        properties: { videoId: { type: "string" } },
        required: ["videoId"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube video detail <videoId>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__video__stats",
      description: "Get statistics of a YouTube video",
      parameters: {
        type: "object",
        properties: { videoId: { type: "string" } },
        required: ["videoId"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube video stats <videoId>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__video__search",
      description: "Search for YouTube videos",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube video search <query>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__channel__list",
      description: "List videos in a channel",
      parameters: {
        type: "object",
        properties: { channelId: { type: "string" } },
        required: ["channelId"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube channel list <channelId>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__channel__detail",
      description: "Get details of a YouTube channel",
      parameters: {
        type: "object",
        properties: { channelId: { type: "string" } },
        required: ["channelId"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube channel detail <channelId>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__video__transcript",
      description: "Get transcript of a YouTube video",
      parameters: {
        type: "object",
        properties: { videoId: { type: "string" } },
        required: ["videoId"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube video transcript <videoId>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__channel__stats",
      description: "Get statistics of a YouTube channel",
      parameters: {
        type: "object",
        properties: { channelId: { type: "string" } },
        required: ["channelId"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube channel stats <channelId>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__channel__playlists__list",
      description: "List playlists in a channel",
      parameters: {
        type: "object",
        properties: { channelId: { type: "string" } },
        required: ["channelId"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube channel playlists list <channelId>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__channel__search",
      description: "Search content within a channel",
      parameters: {
        type: "object",
        properties: { channelId: { type: "string" }, query: { type: "string" } },
        required: ["channelId", "query"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube channel search <channelId> <query>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__playlist__detail",
      description: "Get details of a playlist",
      parameters: {
        type: "object",
        properties: { playlistId: { type: "string" } },
        required: ["playlistId"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube playlist detail <playlistId>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__playlist__get",
      description: "List items in a playlist",
      parameters: {
        type: "object",
        properties: { playlistId: { type: "string" } },
        required: ["playlistId"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube playlist get <playlistId>" }
  },
  {
    type: "function",
    function: {
      name: "youtube__playlist__search",
      description: "Search content within a playlist",
      parameters: {
        type: "object",
        properties: { playlistId: { type: "string" }, query: { type: "string" } },
        required: ["playlistId", "query"]
      }
    },
    metadata: { requiresHostExecution: true, help: "youtube playlist search <playlistId> <query>" }
  }
];

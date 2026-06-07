import { globals } from '../../common/globals.mjs';
import { Utils } from '../../common/utils.mjs';
import { toolsDefinition } from './tools.mjs';
import { google } from 'googleapis';
import { fetchTranscript } from './transcript.mjs';

export class YoutubePlugin {
  constructor() {
    globals.pluginsRegistry.set('youtube', this);
    this.registerTools();
    this.youtube = null;
  }

  registerTools() {
    globals.dslRegistry.set('youtube__video__detail', this.getVideoDetail.bind(this));
    globals.dslRegistry.set('youtube__video__stats', this.getVideoStats.bind(this));
    globals.dslRegistry.set('youtube__video__search', this.searchVideos.bind(this));
    globals.dslRegistry.set('youtube__video__transcript', this.getVideoTranscript.bind(this));
    
    globals.dslRegistry.set('youtube__channel__list', this.listChannelVideos.bind(this));
    globals.dslRegistry.set('youtube__channel__detail', this.getChannelDetail.bind(this));
    globals.dslRegistry.set('youtube__channel__stats', this.getChannelStats.bind(this));
    globals.dslRegistry.set('youtube__channel__playlists__list', this.listChannelPlaylists.bind(this));
    globals.dslRegistry.set('youtube__channel__search', this.searchChannelContent.bind(this));
    
    globals.dslRegistry.set('youtube__playlist__detail', this.getPlaylistDetail.bind(this));
    globals.dslRegistry.set('youtube__playlist__get', this.listPlaylistItems.bind(this));
    globals.dslRegistry.set('youtube__playlist__search', this.searchPlaylistContent.bind(this));
  }

  get definition() {
    return toolsDefinition;
  }

  async getClient() {
      if (this.youtube) return this.youtube;
      const apiKey = process.env.YOUTUBE_API_KEY || globals.config.youtube_api_key;
      if (!apiKey) throw new Error('YOUTUBE_API_KEY not found');
      this.youtube = google.youtube({ version: 'v3', auth: apiKey });
      return this.youtube;
  }

  async getVideoDetail(args) {
    const videoId = this._extractVideoId(args.videoId || args[0]);
    Utils.logInfo(`Fetching video details for: ${videoId}`);
    
    const yt = await this.getClient();
    const response = await yt.videos.list({
      part: ['snippet', 'contentDetails', 'statistics', 'status'],
      id: [videoId]
    });

    if (!response.data.items?.length) throw new Error(`Video not found: ${videoId}`);
    
    const video = response.data.items[0];
    const result = {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      channel: { id: video.snippet.channelId, title: video.snippet.channelTitle },
      publishedAt: video.snippet.publishedAt,
      duration: this._parseDuration(video.contentDetails.duration),
      statistics: {
        viewCount: this._formatNumber(video.statistics.viewCount),
        likeCount: this._formatNumber(video.statistics.likeCount)
      },
      url: `https://www.youtube.com/watch?v=${video.id}`
    };
    Utils.logInfo(`Video detail:\n${JSON.stringify(result, null, 2)}`);
    return result;
  }

  async getVideoStats(args) {
    const videoId = this._extractVideoId(args.videoId || args[0]);
    Utils.logInfo(`Fetching stats for: ${videoId}`);
    
    const yt = await this.getClient();
    const response = await yt.videos.list({
      part: ['statistics', 'snippet'],
      id: [videoId]
    });

    if (!response.data.items?.length) throw new Error(`Video not found: ${videoId}`);
    
    const video = response.data.items[0];
    return {
      videoId: video.id,
      title: video.snippet.title,
      statistics: video.statistics,
      url: `https://www.youtube.com/watch?v=${video.id}`
    };
  }

  async searchVideos(args) {
    const query = args.query || args[0];
    Utils.logInfo(`Searching YouTube for: "${query}"`);
    
    const yt = await this.getClient();
    const response = await yt.search.list({
      part: ['snippet'],
      q: query,
      maxResults: 10,
      type: ['video'],
      safeSearch: 'none'
    });

    const results = (response.data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));
    
    Utils.logInfo(`Found ${results.length} videos:\n${JSON.stringify(results, null, 2)}`);
    return results;
  }

  async getVideoTranscript(args) {
    const videoId = this._extractVideoId(args.videoId || args[0]);
    Utils.logInfo(`Fetching transcript for: ${videoId}`);
    
    try {
        const transcript = await fetchTranscript(videoId);
        const fullText = transcript.map(entry => entry.text).join(' ');
        return {
            videoId,
            fullText,
            transcript: transcript.map(t => ({
                text: t.text,
                startTime: t.offset / 1000,
                timestamp: this._formatTimestamp(t.offset / 1000)
            }))
        };
    } catch (e) {
        throw new Error(`Failed to get transcript: ${e.message}`);
    }
  }
  
  async listChannelVideos(args) {
    const channelId = this._extractChannelId(args.channelId || args[0]);
    Utils.logInfo(`Listing videos for channel: ${channelId}`);
    
    const yt = await this.getClient();
    const response = await yt.search.list({
      part: ['snippet'],
      channelId: channelId,
      maxResults: 25,
      order: 'date',
      type: ['video']
    });

    return (response.data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));
  }

  async getChannelDetail(args) {
    const channelId = this._extractChannelId(args.channelId || args[0]);
    Utils.logInfo(`Fetching channel details: ${channelId}`);
    
    const yt = await this.getClient();
    const response = await yt.channels.list({
      part: ['snippet', 'statistics'],
      id: [channelId]
    });

    if (!response.data.items?.length) throw new Error(`Channel not found: ${channelId}`);
    
    const channel = response.data.items[0];
    return {
      id: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description,
      statistics: {
        subscribers: this._formatNumber(channel.statistics.subscriberCount),
        videos: this._formatNumber(channel.statistics.videoCount),
        views: this._formatNumber(channel.statistics.viewCount)
      },
      url: `https://www.youtube.com/channel/${channel.id}`
    };
  }

  async getChannelStats(args) {
    const channelId = this._extractChannelId(args.channelId || args[0]);
    const yt = await this.getClient();
    const response = await yt.channels.list({
      part: ['statistics', 'snippet'],
      id: [channelId]
    });

    if (!response.data.items?.length) throw new Error(`Channel not found: ${channelId}`);
    return response.data.items[0].statistics;
  }

  async listChannelPlaylists(args) {
    const channelId = this._extractChannelId(args.channelId || args[0]);
    const yt = await this.getClient();
    const response = await yt.playlists.list({
      part: ['snippet', 'contentDetails'],
      channelId: channelId,
      maxResults: 25
    });

    return (response.data.items || []).map(item => ({
      id: item.id,
      title: item.snippet.title,
      itemCount: item.contentDetails.itemCount,
      url: `https://www.youtube.com/playlist?list=${item.id}`
    }));
  }

  async searchChannelContent(args) {
    const channelId = this._extractChannelId(args.channelId || args[0]);
    const query = args.query || args[1];
    
    const yt = await this.getClient();
    const response = await yt.search.list({
      part: ['snippet'],
      channelId: channelId,
      q: query,
      maxResults: 10,
      type: ['video']
    });

    return (response.data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));
  }
  
  async getPlaylistDetail(args) {
    const playlistId = this._extractPlaylistId(args.playlistId || args[0]);
    const yt = await this.getClient();
    const response = await yt.playlists.list({
      part: ['snippet', 'contentDetails'],
      id: [playlistId]
    });

    if (!response.data.items?.length) throw new Error(`Playlist not found: ${playlistId}`);
    const pl = response.data.items[0];
    return {
        id: pl.id,
        title: pl.snippet.title,
        itemCount: pl.contentDetails.itemCount,
        url: `https://www.youtube.com/playlist?list=${pl.id}`
    };
  }

  async listPlaylistItems(args) {
    const playlistId = this._extractPlaylistId(args.playlistId || args[0]);
    const yt = await this.getClient();
    const response = await yt.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId: playlistId,
      maxResults: 50
    });

    return (response.data.items || []).map(item => ({
      videoId: item.contentDetails.videoId,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`
    }));
  }

  async searchPlaylistContent(args) {
    const playlistId = this._extractPlaylistId(args.playlistId || args[0]);
    const query = (args.query || args[1] || '').toLowerCase();
    
    const yt = await this.getClient();
    const response = await yt.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId: playlistId,
      maxResults: 50
    });

    return (response.data.items || [])
        .filter(item => 
            item.snippet.title.toLowerCase().includes(query) || 
            item.snippet.description.toLowerCase().includes(query)
        )
        .map(item => ({
            videoId: item.contentDetails.videoId,
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`
        }));
  }

  // Helpers
  _extractVideoId(input) {
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
    const match = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : input;
  }

  _extractChannelId(input) {
    if (/^UC[a-zA-Z0-9_-]{22}$/.test(input)) return input;
    const match = input.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    return match ? match[1] : input;
  }

  _extractPlaylistId(input) {
    if (/^[A-Za-z0-9_-]{34}$/.test(input)) return input;
    const match = input.match(/[?&]list=([A-Za-z0-9_-]+)/);
    return match ? match[1] : input;
  }

  _parseDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;
    const parts = [];
    if (match[1]) parts.push(`${match[1]}h`);
    if (match[2]) parts.push(`${match[2]}m`);
    if (match[3]) parts.push(`${match[3]}s`);
    return parts.join(' ') || '0s';
  }

  _formatNumber(num) {
    if (!num) return '0';
    const n = parseInt(num);
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  _formatTimestamp(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 
        ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
        : `${m}:${s.toString().padStart(2,'0')}`;
  }
}

export const youtubePlugin = new YoutubePlugin();

/**
 * YouTube Transcript Fetcher
 * 
 * Uses yt-dlp to fetch YouTube video transcripts/captions.
 * This is more reliable than trying to parse YouTube's internal APIs directly,
 * as yt-dlp handles browser impersonation and anti-bot measures.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Fetch transcript for a YouTube video using yt-dlp
 * @param {string} videoId - The YouTube video ID
 * @param {object} options - Options object
 * @param {string} options.lang - Preferred language code (e.g., 'en', 'es')
 * @returns {Promise<Array>} Array of transcript entries with text, offset, and duration
 */
export async function fetchTranscript(videoId, options = {}) {
  const { lang = 'en' } = options;
  const ytDlpPath = join(__dirname, 'yt-dlp');
  const tempDir = tmpdir();
  const outputTemplate = join(tempDir, `yt-transcript-${videoId}`);

  try {
    // Use yt-dlp to download subtitles only (skip video download)
    const subLang = lang === 'auto' ? 'en' : lang;
    const command = `"${ytDlpPath}" --write-auto-sub --sub-lang "${subLang}" --skip-download --output "${outputTemplate}" "https://www.youtube.com/watch?v=${videoId}"`;

    await execAsync(command, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    // Read the downloaded VTT file
    const vttPath = `${outputTemplate}.${subLang}.vtt`;
    const vttContent = await readFile(vttPath, 'utf-8');

    // Clean up the temporary file
    await unlink(vttPath).catch(() => { });

    // Parse VTT content
    const transcript = parseVTT(vttContent);

    return transcript;
  } catch (error) {
    throw new Error(`Failed to fetch transcript: ${error.message}`);
  }
}

/**
 * Parse WebVTT format captions
 * @param {string} vttContent - VTT file content
 * @returns {Array} Parsed transcript entries
 */
function parseVTT(vttContent) {
  const transcript = [];
  const lines = vttContent.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for timestamp lines (format: 00:00:00.000 --> 00:00:02.500)
    if (line.includes('-->')) {
      const [startTime, endTime] = line.split('-->').map(t => t.trim());
      const offset = parseVTTTimestamp(startTime);
      const endOffset = parseVTTTimestamp(endTime);
      const duration = endOffset - offset;

      // Next lines are the subtitle text until we hit a blank line
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }

      const text = textLines.join(' ')
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .trim();

      if (text) {
        transcript.push({
          text,
          offset, // in milliseconds
          duration // in milliseconds
        });
      }
    }
    i++;
  }

  return transcript;
}

/**
 * Parse VTT timestamp to milliseconds
 * @param {string} timestamp - VTT timestamp (e.g., "00:00:12.345" or "00:12.345")
 * @returns {number} Milliseconds
 */
function parseVTTTimestamp(timestamp) {
  const parts = timestamp.split(':');
  let hours = 0, minutes = 0, seconds = 0;

  if (parts.length === 3) {
    // HH:MM:SS.mmm
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    seconds = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    // MM:SS.mmm
    minutes = parseInt(parts[0], 10);
    seconds = parseFloat(parts[1]);
  } else {
    // SS.mmm
    seconds = parseFloat(parts[0]);
  }

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * List available caption tracks for a video using yt-dlp
 * @param {string} videoId - The YouTube video ID
 * @returns {Promise<Array>} Array of available caption tracks with language info
 */
export async function listCaptionTracks(videoId) {
  const ytDlpPath = join(__dirname, 'yt-dlp');

  try {
    // Use yt-dlp to list available subtitles
    const command = `"${ytDlpPath}" --list-subs "https://www.youtube.com/watch?v=${videoId}"`;

    const { stdout } = await execAsync(command, {
      timeout: 15000, // 15 second timeout
      maxBuffer: 5 * 1024 * 1024 // 5MB buffer
    });

    // Parse the output to extract language codes
    // yt-dlp outputs subtitle info in a table format
    const tracks = [];
    const lines = stdout.split('\n');
    let inSubtitlesSection = false;

    for (const line of lines) {
      if (line.includes('Available subtitles') || line.includes('automatic captions')) {
        inSubtitlesSection = true;
        continue;
      }

      if (inSubtitlesSection && line.trim()) {
        // Extract language code from lines like "en   English"
        const match = line.match(/^([a-z]{2}(?:-[A-Z]{2})?)\s+(.+?)(?:\s|$)/);
        if (match) {
          tracks.push({
            languageCode: match[1],
            language: match[2].trim(),
            isAutoGenerated: lines.some(l => l.includes('automatic captions'))
          });
        }
      }
    }

    return tracks;
  } catch (error) {
    throw new Error(`Failed to list caption tracks: ${error.message}`);
  }
}

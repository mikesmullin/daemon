// Gemini Image Generation (Nano Banana)
//
// - generate_image_gemini(prompt, options?) // Generate images using Google's Gemini 2.5 Flash Image model
//

import { _G } from '../lib/globals.mjs';
import utils, { log } from '../lib/utils.mjs';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Google GenAI client
let geminiClient = null;

async function initGeminiClient() {
  if (geminiClient) {
    return geminiClient;
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey || apiKey === 'your_google_ai_api_key_here') {
    throw new Error(
      'Google AI API key not found. Please set GOOGLE_AI_API_KEY in your .env file. ' +
      'Get your API key from: https://aistudio.google.com/apikey'
    );
  }

  try {
    geminiClient = new GoogleGenAI({
      apiKey: apiKey
    });
    
    // Test the connection by trying to access the models
    const model = geminiClient.models;
    log('debug', '✅ Google GenAI client initialized successfully');
    
    return geminiClient;
  } catch (error) {
    throw new Error(`Failed to initialize Google GenAI client: ${error.message}`);
  }
}

// Ensure output directory exists
function ensureOutputDir(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    log('debug', `📁 Created output directory: ${outputDir}`);
  }
}

// Generate unique filename
function generateFilename(prompt, format = 'png') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedPrompt = prompt
    .slice(0, 50)
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
  return `gemini_${timestamp}_${sanitizedPrompt}.${format}`;
}

_G.tools.generate_image_gemini = {
  definition: {
    type: 'function',
    function: {
      name: 'generate_image_gemini',
      description: 'Generate and edit images using Google\'s Gemini 2.5 Flash Image model (aka Nano Banana). Supports text-to-image generation, image editing, style transfer, and conversational refinement. Cost: $0.039 per image.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed text prompt describing the image to generate or edit. Be specific and descriptive for best results.'
          },
          mode: {
            type: 'string',
            enum: ['generate', 'edit', 'style_transfer', 'composition'],
            default: 'generate',
            description: 'Generation mode: generate (text-to-image), edit (modify existing image), style_transfer (apply artistic style), composition (combine multiple images)'
          },
          input_image_urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'URLs or file paths of input images for editing modes. Required for edit, style_transfer, and composition modes.'
          },
          aspect_ratio: {
            type: 'string',
            enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
            default: '1:1',
            description: 'Aspect ratio of the generated image. Default is 1:1 (1024x1024px)'
          },
          output_dir: {
            type: 'string',
            description: 'Directory to save generated images. Defaults to tmp/generated_images'
          },
          response_mode: {
            type: 'string',
            enum: ['image_only', 'text_and_image'],
            default: 'text_and_image',
            description: 'Whether to return descriptive text along with the image'
          }
        },
        required: ['prompt']
      }
    }
  },
  execute: async (args, options = {}) => {
    const {
      prompt,
      mode = 'generate',
      input_image_urls = [],
      aspect_ratio = process.env.GEMINI_IMAGE_DEFAULT_ASPECT_RATIO || '1:1',
      output_dir = process.env.GEMINI_IMAGE_DEFAULT_OUTPUT_DIR || 'tmp/generated_images',
      response_mode = 'text_and_image'
    } = args;

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }

    if (['edit', 'style_transfer', 'composition'].includes(mode) && input_image_urls.length === 0) {
      throw new Error(`Mode '${mode}' requires at least one input image URL`);
    }

    log('debug', `🎨 Generating image with Gemini 2.5 Flash Image...`);
    log('debug', `   Mode: ${mode}`);
    log('debug', `   Aspect ratio: ${aspect_ratio}`);
    log('debug', `   Prompt: "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

    try {
      const client = await initGeminiClient();
      
      // Ensure output directory exists
      const fullOutputDir = path.resolve(output_dir);
      ensureOutputDir(fullOutputDir);

      // Prepare the content array
      const contents = [prompt];

      // Add input images if provided
      if (input_image_urls.length > 0) {
        log('debug', `   Including ${input_image_urls.length} input image(s)`);
        
        for (const imageUrl of input_image_urls) {
          try {
            // Handle both file paths and URLs
            if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
              // For URLs, we'd need to fetch and convert to the format Gemini expects
              // For now, we'll assume local file paths are more common
              throw new Error('URL-based images not yet implemented. Please use local file paths.');
            } else {
              // Local file path
              const imagePath = path.resolve(imageUrl);
              if (!fs.existsSync(imagePath)) {
                throw new Error(`Image file not found: ${imagePath}`);
              }
              
              // Read image file and add to contents
              const imageBuffer = fs.readFileSync(imagePath);
              const mimeType = imagePath.endsWith('.png') ? 'image/png' : 
                              imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg') ? 'image/jpeg' :
                              'image/png'; // default
              
              contents.push({
                inlineData: {
                  data: imageBuffer.toString('base64'),
                  mimeType: mimeType
                }
              });
            }
          } catch (error) {
            log('warn', `⚠️  Failed to load image ${imageUrl}: ${error.message}`);
          }
        }
      }

      // Configure the request
      log('debug', '🔄 Sending request to Gemini API...');
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: contents,
        config: {
          responseModalities: response_mode === 'image_only' ? ['Image'] : ['Text', 'Image'],
          imageConfig: {
            aspectRatio: aspect_ratio
          }
        }
      });

      const results = [];
      let textResponse = null;
      let imageCount = 0;

      // Process response parts
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          textResponse = part.text;
          log('debug', `📝 Received text response: "${part.text.slice(0, 100)}..."`);
        } else if (part.inlineData) {
          imageCount++;
          
          // Generate filename and save image
          const filename = generateFilename(prompt, 'png');
          const imagePath = path.join(fullOutputDir, filename);
          
          // Save the image
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(imagePath, imageBuffer);
          
          const imageInfo = {
            path: imagePath,
            filename: filename,
            size: imageBuffer.length,
            aspect_ratio: aspect_ratio,
            mode: mode
          };
          
          results.push(imageInfo);
          log('info', `🖼️  Image saved: ${imagePath} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
        }
      }

      // Prepare response
      const contentSummary = `Generated ${imageCount} image(s) using Gemini 2.5 Flash Image model. ` +
        `Images saved to: ${fullOutputDir}. ` +
        `Cost: $${(imageCount * 0.039).toFixed(3)}`;

      const responseData = {
        success: true,
        content: textResponse || contentSummary,
        metadata: {
          operation: 'generate_image_gemini',
          mode: mode,
          prompt: prompt,
          images_generated: imageCount,
          images: results,
          cost_estimate: `$${(imageCount * 0.039).toFixed(3)}`,
          output_directory: fullOutputDir,
          aspect_ratio: aspect_ratio,
          response_mode: response_mode
        }
      };

      log('info', `✅ Successfully generated ${imageCount} image(s) using Gemini 2.5 Flash Image`);
      log('info', `💰 Estimated cost: $${(imageCount * 0.039).toFixed(3)}`);

      return responseData;

    } catch (error) {
      log('error', `❌ Error generating image with Gemini: ${error.message}`);
      
      // Provide helpful error messages
      let errorMessage = error.message;
      if (error.message.includes('API key')) {
        errorMessage = 'Invalid Google AI API key. Please check your GOOGLE_AI_API_KEY in the .env file. ' +
          'Get a new API key from: https://aistudio.google.com/apikey';
      } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
        errorMessage = 'API quota exceeded or rate limit reached. Please check your Google AI Studio usage and billing.';
      } else if (error.message.includes('safety')) {
        errorMessage = 'Content was blocked by safety filters. Please try a different prompt that complies with Google\'s content policies.';
      }
      
      return {
        success: false,
        content: `Failed to generate image: ${errorMessage}`,
        metadata: {
          operation: 'generate_image_gemini',
          mode: mode,
          prompt: prompt,
          error: error.message,
          aspect_ratio: aspect_ratio,
          output_directory: output_dir
        }
      };
    }
  }
};
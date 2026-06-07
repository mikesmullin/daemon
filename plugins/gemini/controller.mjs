import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { Utils } from '../../common/utils.mjs';
import { globals } from '../../common/globals.mjs';

// Initialize Google GenAI client
let geminiClient = null;

async function initGeminiClient() {
  if (geminiClient) {
    return geminiClient;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'your_google_api_key_here') {
    throw new Error(
      'AI API key not found. Please set GEMINI_API_KEY in your .env file or config. ' +
      'Get your API key from: https://aistudio.google.com/apikey'
    );
  }

  try {
    geminiClient = new GoogleGenAI({
      apiKey: apiKey
    });

    // Test the connection by trying to access the models
    // const model = geminiClient.models; // Accessing models property doesn't make a network call usually

    return geminiClient;
  } catch (error) {
    throw new Error(`Failed to initialize Google GenAI client: ${error.message}`);
  }
}

// Ensure output directory exists
function ensureOutputDir(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
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

export async function generateImage(args) {
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

  try {
    const client = await initGeminiClient();

    // Ensure output directory exists
    const fullOutputDir = path.resolve(output_dir);
    ensureOutputDir(fullOutputDir);

    // Prepare the content array
    const contents = [prompt];

    // Add input images if provided
    if (input_image_urls.length > 0) {
      Utils.logDebug(`   Including ${input_image_urls.length} input image(s)`);

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
          Utils.logWarn(`⚠️  Failed to load image ${imageUrl}: ${error.message}`);
        }
      }
    }

    // Configure the request
    const response = await client.models.generateContent({
      //model: 'gemini-2.5-flash-image', // Nano Banana
      model: 'gemini-3-pro-image-preview', // Nano Banana Pro
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
    if (response.candidates && response.candidates.length > 0 && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          textResponse = part.text;
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
          Utils.logInfo(`🖼️  Image saved: ${imagePath} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
        }
      }
    } else {
        Utils.logWarn('No candidates or content parts in response');
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

    Utils.logInfo(`✅ Successfully generated ${imageCount} image(s) using Gemini 2.5 Flash Image`);
    Utils.logInfo(`💰 Estimated cost: $${(imageCount * 0.039).toFixed(3)}`);

    return responseData;

  } catch (error) {
    Utils.logError(`❌ Error generating image with Gemini: ${error.message}`);

    // Provide helpful error messages
    let errorMessage = error.message;
    if (error.message.includes('API key')) {
      errorMessage = 'Invalid Google AI API key. Please check your GEMINI_API_KEY in the .env file. ' +
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
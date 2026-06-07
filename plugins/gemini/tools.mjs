export const toolsDefinition = [
  {
    type: 'function',
    function: {
      name: 'gemini__image__generate',
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
    },
    metadata: { help: 'gemini image generate <prompt> [mode] [aspect_ratio]' }
  }
];

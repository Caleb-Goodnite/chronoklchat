import { json } from '@sveltejs/kit';
import { OpenAI } from 'openai';
import { env } from '$env/dynamic/private';

// Map our internal role names to OpenRouter expected roles
function mapRole(role) {
  const map = { 'ai': 'assistant', 'user': 'user', 'system': 'system' };
  return map[role] || 'user';
}

// Helper to process message content for the API
function processMessageContent(content) {
  if (!content) return [];
  
  // If it's a string, wrap it in a text content part
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  
  // If it's an array, process each part
  if (Array.isArray(content)) {
    return content.map(part => {
      if (part.type === 'image_url' && part.image_url && part.image_url.url) {
        // Handle base64 images or URLs
        return {
          type: 'image_url',
          image_url: {
            url: part.image_url.url
          }
        };
      }
      // Default to text
      return { type: 'text', text: String(part.text || '') };
    }).filter(part => part.text || (part.type === 'image_url' && part.image_url.url));
  }
  
  // Default fallback
  return [{ type: 'text', text: String(content) }];
}

export async function POST({ request, url }) {
  try {
    const body = await request.json();
    const { messages, model: frontendModel } = body || {};
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages is required and must be a non-empty array' }, { status: 400 });
    }

    const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return json({ error: 'Server missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    // Get model from the request or default to GPT-5 Nano
    const model = frontendModel || 'openai/gpt-5-nano';
    const APP_REFERER = env.APP_REFERER || url.origin || 'http://localhost:5173';

    // Process messages for the API
    const filteredMessages = messages
      .filter(m => !m.loading)
      .map(({ role, content }) => {
        // Handle different content formats (text, array of content parts, etc.)
        let processedContent = content;
        
        if (Array.isArray(content)) {
          // Handle array content (text + images)
          processedContent = content.map(part => {
            if (part.type === 'image_url' && part.image_url?.url) {
              return {
                type: 'image_url',
                image_url: {
                  url: part.image_url.url
                }
              };
            }
            return { type: 'text', text: String(part.text || part) };
          });
        } else if (typeof content === 'string') {
          processedContent = [{ type: 'text', text: content }];
        }
        
        return {
          role: mapRole(role),
          content: processedContent
        };
      });

    // Prepare the request body
    const requestBody = {
      model,
      messages: filteredMessages,
      // Add any model-specific parameters
      ...(model.includes('gpt-5') && {
        // GPT-5-specific settings
        temperature: 0.75,
        max_tokens: 3000,
        top_p: 0.9,
      })
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': APP_REFERER,
        'X-Title': 'ChronoklChat',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const completion = await response.json();

    const responseMessage = completion.choices[0]?.message;
    
    if (!responseMessage) {
      throw new Error('No response message from API');
    }

    return json({ 
      message: {
        role: 'ai',
        content: responseMessage.content
      },
      raw: completion 
    });
    
  } catch (err) {
    console.error('OpenRouter API error:', err);
    const status = err.status || 500;
    const errorMessage = err.error?.message || err.message || 'Unknown error';
    return json({ 
      error: 'API Error',
      message: errorMessage,
      details: err.error?.details || err.error || String(err)
    }, { status });
  }
}

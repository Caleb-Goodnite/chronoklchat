import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import type { OpenAI } from 'openai';
import { env } from '$env/dynamic/private';

interface ChatMessage {
  role: 'user' | 'ai' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  loading?: boolean;
  id?: number;
  streaming?: boolean;
  error?: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
}

interface NameGenerationRequest {
  messages: ChatMessage[];
}

interface NameGenerationResponse {
  title: string;
}

interface APIError {
  error: string;
  message: string;
  details?: any;
}

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

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    const body: ChatRequest = await request.json();
    const { messages, model: frontendModel } = body;
    
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
      .filter((m: ChatMessage) => !m.loading)
      .map(({ role, content }) => {
        // Handle different content formats (text, array of content parts, etc.)
        let processedContent: any = content;
        
        if (Array.isArray(content)) {
          // Handle array content (text + images)
          processedContent = content.map((part: any) => {
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
      stream: true,
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    // Stream the response using Server-Sent Events
    return new Response(
      new ReadableStream({
        async start(controller) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    controller.enqueue(`data: ${JSON.stringify({ done: true })}\n\n`);
                    break;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content || '';
                    if (content) {
                      controller.enqueue(`data: ${JSON.stringify({ content })}\n\n`);
                    }
                  } catch (e) {
                    // Skip invalid JSON lines
                  }
                }
              }
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        }
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
    
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
};

export const _generateName: RequestHandler = async ({ request }) => {
  try {
    const body: NameGenerationRequest = await request.json();
    const { messages } = body;
    
    if (!Array.isArray(messages) || messages.length < 1) {
      return json({ error: 'messages is required' }, { status: 400 });
    }

    const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return json({ error: 'Server missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    const model = 'openai/gpt-5-nano';
    const APP_REFERER = env.APP_REFERER || 'http://localhost:5173';

    // Create a prompt for name generation
    const namePrompt = {
      role: 'system',
      content: 'You are a helpful AI assistant. Generate a concise, descriptive title for this chat conversation based on the messages below. The title should be 3-8 words maximum, capturing the main topic or question. Do not include quotes or extra text.'
    };

    const conversationMessages = messages.slice(-4).map((msg: ChatMessage) => ({
      role: mapRole(msg.role),
      content: typeof msg.content === 'string' ? msg.content : (msg.content as any)[0]?.text || ''
    }));

    const requestBody = {
      model,
      messages: [namePrompt, ...conversationMessages],
      max_tokens: 20,
      temperature: 0.3
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const completion = await response.json();
    const title = completion.choices[0]?.message?.content?.trim() || 'New Chat';

    return json({ title } as NameGenerationResponse);
  } catch (err: any) {
    console.error('Name generation error:', err);
    return json({ error: err.message || 'Failed to generate name' } as APIError, { status: 500 });
  }
};

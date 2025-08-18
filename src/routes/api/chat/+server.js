import { json } from '@sveltejs/kit';
import { OpenAI } from 'openai';
import { env } from '$env/dynamic/private';

// Map our internal role names to OpenRouter expected roles
function mapRole(role) {
  const map = { 'ai': 'assistant', 'user': 'user', 'system': 'system' };
  return map[role] || 'user';
}

export async function POST({ request, url }) {
  try {
    const body = await request.json();
    const { messages, model } = body || {};
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages is required and must be a non-empty array' }, { status: 400 });
    }

    const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY || '';
    const OPENROUTER_MODEL = env.OPENROUTER_MODEL || 'openai/gpt-oss-20b';
    const APP_REFERER = env.APP_REFERER || url.origin || 'http://localhost:5173';
    const APP_TITLE = env.APP_TITLE || 'ChronoklChat';

    if (!OPENROUTER_API_KEY) {
      return json({ error: 'Server missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    // Filter out loading messages and map roles
    const filteredMessages = messages
      .filter(m => !m.loading)
      .map(({ role, content }) => ({
        role: mapRole(role),
        content: content
      }));

    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': APP_REFERER,
        'X-Title': APP_TITLE,
      },
    });

    const completion = await openai.chat.completions.create({
      model: model || OPENROUTER_MODEL,
      messages: filteredMessages,
      temperature: 0.5,
      max_tokens: 1000
    });

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

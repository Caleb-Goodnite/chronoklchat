import { json } from '@sveltejs/kit';
import { Supermemory } from 'supermemory';
import { BraveSearch } from 'brave-search';

export async function POST({ request }) {
  try {
    const { query } = await request.json();
    
    if (!query || typeof query !== 'string') {
      return json({ error: 'Query is required' }, { status: 400 });
    }

    const supermemoryKey = process.env.SUPERMEMORY_API_KEY;
    const braveKey = process.env.BRAVE_API_KEY;

    if (!supermemoryKey || !braveKey) {
      return json({
        error: 'Search service not configured',
        message: 'Missing SUPERMEMORY_API_KEY or BRAVE_API_KEY environment variables'
      }, { status: 500 });
    }

    const supermemoryClient = new Supermemory({ apiKey: supermemoryKey });
    const braveClient = new BraveSearch({ apiKey: braveKey });

    const memorySearch = await supermemoryClient.search.memories({
      q: query,
      limit: 3
    });

    if (memorySearch.total > 0) {
      return json({
        results: {
          summary: memorySearch.results[0]?.content ?? '',
          title: memorySearch.results[0]?.title ?? null,
          items: memorySearch.results.map((result) => ({
            title: result.title ?? result.metadata?.title ?? 'Grokipedia result',
            snippet: result.content,
            url: result.metadata?.url ?? null
          }))
        }
      });
    }

    const braveResponse = await braveClient.search.query({
      q: `${query} site:grokipedia.com`,
      count: 5
    });

    const webResults = braveResponse.web?.results ?? [];

    if (webResults.length === 0) {
      return json({
        results: {
          summary: `No Grokipedia results found for "${query}". Try rephrasing your question.`,
          items: []
        }
      });
    }

    const topResult = webResults[0];

    await supermemoryClient.memories.add({
      content: topResult.description ?? '',
      metadata: {
        url: topResult.url,
        title: topResult.title,
        source: 'grokipedia'
      },
      title: topResult.title
    });

    const items = webResults.slice(0, 3).map((result) => ({
      title: result.title,
      snippet: result.description ?? '',
      url: result.url
    }));

    return json({
      results: {
        summary: topResult.description ?? '',
        title: topResult.title,
        items
      }
    });
    
  } catch (err) {
    console.error('Search API error:', err);
    return json({ 
      error: 'Search failed',
      message: err.message || 'Unknown error'
    }, { status: 500 });
  }
}

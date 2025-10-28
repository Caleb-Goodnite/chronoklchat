import { json } from '@sveltejs/kit';

export async function POST({ request }) {
  try {
    const { query } = await request.json();
    
    if (!query || typeof query !== 'string') {
      return json({ error: 'Query is required' }, { status: 400 });
    }

    // Use Wikipedia API for search (no CORS issues, no key required)
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'ChronoklChat/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Wikipedia API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Format results from Wikipedia
    const searchResults = data.query?.search || [];
    
    if (searchResults.length === 0) {
      return json({ 
        results: {
          summary: `No Wikipedia results found for "${query}". Try rephrasing your question.`,
          items: []
        }
      });
    }
    
    // Get the first result's extract
    const topResult = searchResults[0];
    const snippet = topResult.snippet.replace(/<[^>]*>/g, ''); // Remove HTML tags
    
    const results = {
      summary: snippet,
      title: topResult.title,
      items: searchResults.slice(0, 3).map(item => ({
        title: item.title,
        snippet: item.snippet.replace(/<[^>]*>/g, ''),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`
      }))
    };
    
    return json({ results });
    
  } catch (err) {
    console.error('Search API error:', err);
    return json({ 
      error: 'Search failed',
      message: err.message || 'Unknown error'
    }, { status: 500 });
  }
}

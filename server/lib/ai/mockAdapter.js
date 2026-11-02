// Mock AI Provider Adapter is strictly disabled for normal users.
// Real AI provider responses are required; if AI servers are unreachable or busy, throw an error.

export async function runMockStream() {
  throw new Error('AI servers busy, try later.');
}

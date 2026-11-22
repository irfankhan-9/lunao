export function sanitizeAndRepairStreamHtml(raw: string): string {
  let out = String(raw || '').trim();
  if (!out) return '';

  const closedFence = out.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  if (closedFence && closedFence[1]) {
    out = closedFence[1].trim();
  } else {
    out = out
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  const docStart = out.search(/<!doctype\s+html|<html[\s>]/i);
  if (docStart !== -1) {
    out = out.slice(docStart).trim();
  }

  const docEndMatch = out.match(/<\/html\s*>/i);
  if (docEndMatch && docEndMatch.index !== undefined) {
    out = out.slice(0, docEndMatch.index + docEndMatch[0].length).trim();
  }

  let lower = out.toLowerCase();
  const hasDocRoot = lower.includes('<!doctype') || lower.includes('<html') || lower.includes('<body');
  const hasBodyStructure =
    lower.includes('<body') ||
    lower.includes('<section') ||
    lower.includes('<main') ||
    lower.includes('<div') ||
    lower.includes('<header');

  if (hasDocRoot && hasBodyStructure && out.length >= 120 && !lower.includes('</html>')) {
    out = out.replace(/<[a-zA-Z!/?][^>]*$/s, '').trim();
    lower = out.toLowerCase();

    const lastStyleOpen = lower.lastIndexOf('<style');
    const lastStyleClose = lower.lastIndexOf('</style>');
    if (lastStyleOpen !== -1 && lastStyleOpen > lastStyleClose) {
      out += '\n</style>';
      lower = out.toLowerCase();
    }

    const lastScriptOpen = lower.lastIndexOf('<script');
    const lastScriptClose = lower.lastIndexOf('</script>');
    if (lastScriptOpen !== -1 && lastScriptOpen > lastScriptClose) {
      out += '\n</script>';
      lower = out.toLowerCase();
    }

    if (lower.includes('<body') && !lower.includes('</body>')) {
      out += '\n</body>';
    }
    out += '\n</html>';
  }

  return out;
}

export function extractSseEvents(
  incomingText: string,
  prevBuffer: string,
  flush = false,
): { events: any[]; remaining: string } {
  const normalized = (prevBuffer + incomingText).replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const remaining = flush ? '' : (parts.pop() || '');
  const events: any[] = [];

  for (const block of parts) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      try {
        events.push(JSON.parse(jsonStr));
      } catch {
        // Ignore malformed/keepalive lines
      }
    }
  }

  return { events, remaining };
}

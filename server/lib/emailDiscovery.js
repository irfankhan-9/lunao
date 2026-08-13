// Email Discovery Module
//
// Handles email discovery for leads via two strategies:
// 1. Custom crawler: Fetch website + common contact paths and extract emails
// 2. Hunter.io fallback: Domain search API when crawler fails or is blocked
//
// Respect robots.txt and rate-limit requests.

import { db } from './db.js';

const USER_AGENT = 'LunaoBot/1.0 (+mailto:contact@lunao.io)';
const REQUEST_DELAY_MS = 1500; // 1.5 second delay between requests to same domain
const REQUEST_TIMEOUT_MS = 10000;

// Common contact page paths to check
const CONTACT_PATHS = [
  '/',
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/contact-us.html',
  '/contact.html',
];

// Email regex pattern (RFC 5322 simplified)
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// False positive patterns to filter
const FALSE_POSITIVE_PATHS = [
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.webp',
  '.css', '.js', '.json', '.xml', '.woff', '.woff2', '.ttf',
  '.mp4', '.mp3', '.pdf', '.zip',
];

// Store last request time per domain for rate limiting
const lastRequestTime = new Map();

function getDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function respectRateLimit(domain) {
  const lastTime = lastRequestTime.get(domain);
  if (lastTime) {
    const elapsed = Date.now() - lastTime;
    if (elapsed < REQUEST_DELAY_MS) {
      await sleep(REQUEST_DELAY_MS - elapsed);
    }
  }
  lastRequestTime.set(domain, Date.now());
}

// Fetch a URL with proper headers and timeout
async function fetchUrl(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...options.headers,
      },
    });
    
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// Check if robots.txt allows crawling a path
async function checkRobotsTxt(domain, path) {
  try {
    const robotsUrl = `https://${domain}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });
    
    if (!response.ok) return true; // No robots.txt = allow all
    
    const text = await response.text();
    const lines = text.split('\n');
    
    let userAgentMatch = false;
    let allowPath = true;
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase().trim();
      
      if (lowerLine.startsWith('user-agent:')) {
        const agent = lowerLine.split(':')[1].trim();
        userAgentMatch = agent === '*' || agent.includes('lunaobot') || agent.includes('bot');
      }
      
      if (userAgentMatch && lowerLine.startsWith('disallow:')) {
        const disallowed = lowerLine.split(':')[1].trim();
        if (path.startsWith(disallowed) || disallowed === '/') {
          allowPath = false;
        }
      }
      
      if (userAgentMatch && lowerLine.startsWith('allow:')) {
        const allowed = lowerLine.split(':')[1].trim();
        if (path.startsWith(allowed)) {
          allowPath = true;
        }
      }
    }
    
    return allowPath;
  } catch {
    return true; // Error reading robots.txt = be permissive
  }
}

// Extract emails from raw HTML text
function extractEmails(html) {
  const matches = html.match(EMAIL_REGEX) || [];
  
  // Filter out common false positives
  const filtered = matches.filter(email => {
    const lower = email.toLowerCase();
    
    // Filter out image filenames
    if (lower.includes('@gmail.com') || lower.includes('@yahoo.com') || 
        lower.includes('@hotmail.com') || lower.includes('@outlook.com')) {
      // These are likely personal emails, not business contact
      // But keep them if we don't have anything better
    }
    
    // Filter out common no-reply addresses
    if (lower.includes('noreply') || lower.includes('no-reply') || 
        lower.includes('donotreply') || lower.includes('don\'t reply')) {
      return false;
    }
    
    return true;
  });
  
  // Dedupe and return
  return [...new Set(filtered)];
}

// Find the best email from a list (prefer business domains)
function findBestEmail(emails, domain) {
  if (!emails.length) return null;
  
  // Priority 1: Emails matching the website domain
  const domainEmails = emails.filter(e => e.toLowerCase().includes(domain.toLowerCase()));
  if (domainEmails.length > 0) {
    // Prefer info@, hello@, contact@ over other patterns
    const businessPatterns = ['info', 'hello', 'contact', 'support', 'sales'];
    for (const pattern of businessPatterns) {
      const match = domainEmails.find(e => e.toLowerCase().startsWith(pattern + '@'));
      if (match) return match;
    }
    return domainEmails[0];
  }
  
  // Priority 2: Common business emails (info, hello, etc.)
  const businessPatterns = ['info@', 'hello@', 'contact@', 'support@', 'sales@'];
  for (const pattern of businessPatterns) {
    const match = emails.find(e => e.toLowerCase().startsWith(pattern));
    if (match) return match;
  }
  
  // Priority 3: Any email from the domain
  if (domainEmails.length > 0) return domainEmails[0];
  
  // Priority 4: Any email (return first one)
  return emails[0];
}

// Check if a URL looks like a blocking page
function isBlockingPage(url, html, statusCode) {
  // Check status code
  if (statusCode === 403 || statusCode === 429) return true;
  
  // Check for CAPTCHA indicators
  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes('captcha') || 
      lowerHtml.includes('recaptcha') ||
      lowerHtml.includes('verify you are human') ||
      lowerHtml.includes('access denied') ||
      lowerHtml.includes('blocked')) {
    return true;
  }
  
  return false;
}

// Crawl a website to find email addresses
async function crawlWebsiteForEmail(websiteUrl) {
  const domain = getDomain(websiteUrl);
  if (!domain) {
    return { email: null, reason: 'Invalid URL' };
  }
  
  // Check robots.txt
  const allowed = await checkRobotsTxt(domain, '/');
  if (!allowed) {
    return { email: null, reason: 'Blocked by robots.txt' };
  }
  
  // Respect rate limit
  await respectRateLimit(domain);
  
  // Try homepage first
  const urlsToCheck = [websiteUrl];
  
  // Add common contact paths
  for (const path of CONTACT_PATHS) {
    const url = new URL(path, websiteUrl).href;
    if (!urlsToCheck.includes(url)) {
      urlsToCheck.push(url);
    }
  }
  
  // Try each URL until we find an email
  for (const url of urlsToCheck) {
    try {
      const response = await fetchUrl(url);
      
      if (!response.ok && response.status !== 200) {
        continue;
      }
      
      // Check for blocking
      const html = await response.text();
      
      if (isBlockingPage(url, html, response.status)) {
        return { email: null, reason: 'Blocked by website' };
      }
      
      // Extract emails
      const emails = extractEmails(html);
      
      if (emails.length > 0) {
        const bestEmail = findBestEmail(emails, domain);
        return { email: bestEmail, source: 'crawler' };
      }
    } catch (err) {
      // Continue to next URL
      console.log(`[emailDiscovery] Error fetching ${url}: ${err.message}`);
    }
  }
  
  return { email: null, reason: 'No email found' };
}

// Hunter.io Domain Search API
async function searchHunterDomain(domain) {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    console.log('[emailDiscovery] Hunter.io API key not configured');
    return { email: null, reason: 'Hunter.io not configured' };
  }
  
  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}&limit=1`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return { email: null, reason: `Hunter API error: ${response.status}` };
    }
    
    const data = await response.json();
    
    if (data.data && data.data.emails && data.data.emails.length > 0) {
      const topEmail = data.data.emails[0];
      return {
        email: topEmail.value,
        source: 'hunter',
        confidence: topEmail.confidence || 0,
      };
    }
    
    return { email: null, reason: 'No email found in Hunter.io' };
  } catch (err) {
    return { email: null, reason: `Hunter API error: ${err.message}` };
  }
}

// Main discovery function
export async function discoverEmailFromWebsite(websiteUrl) {
  if (!websiteUrl) {
    return { email: null, source: null, reason: 'No website provided' };
  }
  
  const domain = getDomain(websiteUrl);
  if (!domain) {
    return { email: null, source: null, reason: 'Invalid URL' };
  }
  
  // Phase 1: Custom crawler
  try {
    const crawlerResult = await crawlWebsiteForEmail(websiteUrl);
    
    if (crawlerResult.email) {
      return {
        email: crawlerResult.email,
        source: 'crawler',
        domain,
      };
    }
    
    // Crawler didn't find email, but wasn't blocked
    // Continue to Hunter.io fallback
  } catch (err) {
    console.log(`[emailDiscovery] Crawler error: ${err.message}`);
  }
  
  // Phase 2: Hunter.io fallback
  try {
    const hunterResult = await searchHunterDomain(domain);
    
    if (hunterResult.email) {
      return {
        email: hunterResult.email,
        source: 'hunter',
        confidence: hunterResult.confidence,
        domain,
      };
    }
  } catch (err) {
    console.log(`[emailDiscovery] Hunter error: ${err.message}`);
  }
  
  return { email: null, source: null, reason: 'Email not found via any method' };
}

// Batch discovery for multiple websites
export async function discoverEmailsBatch(websites, onProgress) {
  const results = [];
  
  for (let i = 0; i < websites.length; i++) {
    const website = websites[i];
    
    if (onProgress) {
      onProgress({
        index: i + 1,
        total: websites.length,
        current: website,
      });
    }
    
    const result = await discoverEmailFromWebsite(website);
    results.push({
      website,
      ...result,
    });
    
    // Small delay between batches
    if (i < websites.length - 1) {
      await sleep(1000);
    }
  }
  
  return results;
}

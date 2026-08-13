// Places API Integration for Email Campaign Lead Discovery
//
// Uses Google Places Text Search API to find businesses, then extracts
// contact details from Place Details. Only stores business_name, phone,
// website, and city.

import { db } from './db.js';

const PLACES_API_BASE = 'https://places.googleapis.com/v1/places:searchText';

// Niche to search query mapping
const NICHE_SEARCH_TERMS: Record<string, string> = {
  'Barber': 'barbershop barbers near me',
  'Salon': 'hair salon beauty salon near me',
  'Dentist': 'dentist dental clinic near me',
  'HVAC': 'hvac heating cooling near me',
  'Gym': 'gym fitness center near me',
  'Roofing': 'roofing contractor roofer near me',
  'Real Estate': 'real estate agent realtor near me',
};

export interface PlacesBusinessResult {
  name: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  placeId: string;
}

export interface PlacesSearchParams {
  city: string;
  niche: string;
  limit?: number;
}

// Search for places using Text Search
export async function searchPlaces(query: string, apiKey: string, pageSize = 20): Promise<any[]> {
  if (!apiKey) {
    throw new Error('Google Places API key not configured');
  }

  try {
    const response = await fetch(`${PLACES_API_BASE}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize,
        locationBias: {
          circle: {
            center: { latitude: 30.2672, longitude: -97.7431 }, // Default to Austin, TX
            radius: 50000, // 50km radius
          },
        },
        includePrimaryBusinessDataTypeNames: ['PLACE'],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Places API error: ${error.error?.message || response.status}`);
    }

    const data = await response.json();
    return data.places || [];
  } catch (err) {
    console.error('[placesApi] Search failed:', err);
    throw err;
  }
}

// Get place details for a specific place
export async function getPlaceDetails(placeId: string, apiKey: string): Promise<any> {
  if (!apiKey) {
    throw new Error('Google Places API key not configured');
  }

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?key=${apiKey}&fields=displayName,formattedAddress,nationalPhoneNumber,website,addressComponents`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Places API error: ${error.error?.message || response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error('[placesApi] Details failed:', err);
    throw err;
  }
}

// Extract city from address components
function extractCity(addressComponents: any[]): string {
  if (!addressComponents) return '';

  // Priority: locality > sublocality > postalTown
  for (const component of addressComponents) {
    const types = component.types || [];
    if (types.includes('locality')) {
      return component.longText || component.shortText || '';
    }
  }

  for (const component of addressComponents) {
    const types = component.types || [];
    if (types.includes('sublocality')) {
      return component.longText || component.shortText || '';
    }
  }

  for (const component of addressComponents) {
    const types = component.types || [];
    if (types.includes('postal_town')) {
      return component.longText || component.shortText || '';
    }
  }

  return '';
}

// Main discovery function - finds businesses with websites
export async function discoverLeadsFromPlaces(
  params: PlacesSearchParams,
  apiKey: string,
  onProgress?: (progress: { current: number; total: number; found: number; currentName: string }) => void
): Promise<PlacesBusinessResult[]> {
  const { city, niche, limit = 50 } = params;
  
  if (!apiKey) {
    throw new Error('Google Places API key not configured');
  }

  const searchTerm = NICHE_SEARCH_TERMS[niche] || `${niche} near ${city}`;
  const fullQuery = `${searchTerm} in ${city}`;
  
  const results: PlacesBusinessResult[] = [];
  let totalFound = 0;

  try {
    // Phase 1: Text Search
    if (onProgress) {
      onProgress({ current: 0, total: limit, found: 0, currentName: 'Searching...' });
    }

    const places = await searchPlaces(fullQuery, apiKey);
    
    // Phase 2: Get details for each place
    for (const place of places) {
      if (results.length >= limit) break;
      
      if (onProgress) {
        onProgress({ 
          current: results.length, 
          total: limit, 
          found: results.filter(r => r.website).length,
          currentName: place.displayName?.text || 'Loading...'
        });
      }

      // Skip places without required data
      if (!place.id) continue;

      try {
        // Small delay to respect rate limits
        await sleep(100);

        const details = await getPlaceDetails(place.id, apiKey);
        
        // Only include businesses with a website (for email discovery)
        if (!details.website) {
          continue;
        }

        const city = extractCity(details.addressComponents);

        results.push({
          name: details.displayName?.text || place.displayName?.text || '',
          phone: details.nationalPhoneNumber || '',
          website: details.website,
          address: details.formattedAddress || '',
          city,
          placeId: place.id,
        });

        totalFound++;
      } catch (err) {
        console.log(`[placesApi] Failed to get details for ${place.displayName?.text}: ${err.message}`);
        // Continue to next place
      }
    }

    if (onProgress) {
      onProgress({ 
        current: results.length, 
        total: limit, 
        found: results.length,
        currentName: 'Complete'
      });
    }

    return results;
  } catch (err) {
    console.error('[placesApi] Discovery failed:', err);
    throw err;
  }
}

// Store discovered leads in the campaign
export function storeDiscoveredLeads(
  campaignId: string,
  leads: PlacesBusinessResult[]
): number {
  let count = 0;
  
  for (const lead of leads) {
    try {
      addEmailLead({
        campaignId,
        businessName: lead.name,
        phone: lead.phone,
        city: lead.city,
        website: lead.website,
        email: '', // Email discovery happens separately
        emailSource: 'places_api',
        verificationStatus: 'pending',
        slug: slugify(lead.name, lead.city),
      });
      count++;
    } catch (err) {
      console.error(`[placesApi] Failed to store lead ${lead.name}: ${err.message}`);
    }
  }
  
  return count;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slugify(name: string, city: string): string {
  const base = `${name} ${city}`.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base.slice(0, 50);
}

// Import database functions
import {
  addEmailLead,
} from './emailCampaigns.js';

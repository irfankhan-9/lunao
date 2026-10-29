// scripts/compile-hvac-templates.mjs
// Compiles canonical bespoke HVAC template into preview/root files and Apex site

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { compileSite } from '../server/lib/compile.js';

export const SAMPLE_HVAC_BIZ = {
  name: 'Aeris & Therma Climate Atelier',
  business_name_short: 'Aeris & Therma',
  slug: 'aeris-therma-climate-atelier-austin',
  city: 'Austin, TX',
  state: 'TX',
  phone: '(512) 555-0199',
  phone_raw: '5125550199',
  email: 'concierge@aeristherma.com',
  address: '740 Congress Ave, Mechanical Suite 4A, Austin, TX',
  business_description: 'Premier residential and commercial HVAC engineering, inverter heat pumps, concealed high-velocity zoning, and hospital-grade indoor air quality purification in Austin, TX.',
  hero_image: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=1920&q=85',
  before_image_url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  after_image_url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
  instagram: 'aeris_therma',
  facebook: 'https://facebook.com/aeristherma',
  tiktok: 'aeristherma',
  youtube: 'https://youtube.com/@aeristherma',
  google_rating: '4.9',
  google_review_count: '342',
  years_in_business: '2012',
  website: 'https://aeristherma.com',
  booking_url: '#booking'
};

export const APEX_CLIMATE_BIZ = {
  name: 'Apex Climate Care',
  business_name_short: 'Apex',
  slug: 'apex-climate-care-austin',
  city: 'Austin, TX',
  state: 'TX',
  phone: '+1 (512) 555-0199',
  phone_raw: '15125550199',
  email: 'contact@apexclimatecare.com',
  address: 'Downtown Austin',
  business_description: 'Premier residential and commercial HVAC engineering, inverter heat pumps, concealed high-velocity zoning, and hospital-grade indoor air quality purification in Austin, TX.',
  hero_image: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=1920&q=85',
  before_image_url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  after_image_url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
  instagram: 'apex_climate_care',
  facebook: 'https://facebook.com/apex_climate_care',
  tiktok: 'apex_climate_care',
  youtube: 'https://youtube.com/@apex_climate_care',
  google_rating: '4.9',
  google_review_count: '342',
  years_in_business: '2015',
  website: 'https://apexclimatecare.com',
  booking_url: '#booking'
};

export async function runCompilation() {
  console.log('--- Compiling 6 preview/root files using canonical compileSite() ---');
  const compiledSample = await compileSite(SAMPLE_HVAC_BIZ, 'hvac-bespoke');
  
  const previewTargets = [
    'public/hvac-bespoke.html',
    'public/hvac-template.html',
    'public/hvac-template-02.html',
    'hvac-bespoke.html',
    'hvac-template.html',
    'hvac-template-02.html'
  ];

  const previewHashes = {};
  for (const t of previewTargets) {
    fs.writeFileSync(t, compiledSample.html, 'utf8');
    const buf = fs.readFileSync(t);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    previewHashes[t] = { bytes: buf.length, hash };
    console.log(`Compiled -> ${t} (${buf.length} bytes, SHA: ${hash.slice(0, 12)}...)`);
  }

  console.log('\n--- Compiling Apex Climate Care Site using canonical compileSite() ---');
  const compiledApex = await compileSite(APEX_CLIMATE_BIZ, 'hvac-bespoke');
  const apexTarget = 'sites/apex-climate-care-austin/index.html';
  fs.writeFileSync(apexTarget, compiledApex.html, 'utf8');
  const apexBuf = fs.readFileSync(apexTarget);
  const apexHash = crypto.createHash('sha256').update(apexBuf).digest('hex');
  console.log(`Compiled -> ${apexTarget} (${apexBuf.length} bytes, SHA: ${apexHash.slice(0, 12)}...)`);

  return { previewHashes, apexHash, apexBytes: apexBuf.length };
}

if (process.argv[1] && process.argv[1].endsWith('compile-hvac-templates.mjs')) {
  runCompilation().catch(err => {
    console.error('Compilation failed:', err);
    process.exit(1);
  });
}

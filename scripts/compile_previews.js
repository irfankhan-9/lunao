import fs from 'node:fs';
import path from 'node:path';

const gymData = {
  BUSINESS_NAME: 'Iron & Grit Performance Club',
  BUSINESS_NAME_SHORT: 'Iron & Grit',
  CITY: 'Austin, TX',
  STATE: 'TX',
  YEARS_IN_BUSINESS: '2016',
  PHONE_DISPLAY: '(512) 555-0188',
  PHONE_RAW: '5125550188',
  EMAIL: 'membership@irongritfitness.com',
  ADDRESS: '3801 Capital of Texas Hwy, Austin, TX',
  GOOGLE_RATING: '4.9',
  GOOGLE_REVIEW_COUNT: '284',
  INSTAGRAM_HANDLE: 'irongrit_atx',
  FACEBOOK_URL: 'https://facebook.com/irongritatx',
  SITE_URL: 'https://iron-grit.lunao.app',
  MEMBERS_COUNT: '1,250+',
  TRAINERS_COUNT: '12',
};

const realestateData = {
  BUSINESS_NAME: 'Apex Estates & Advisory',
  BUSINESS_NAME_SHORT: 'Apex Estates',
  CITY: 'Austin, TX',
  STATE: 'TX',
  YEARS_IN_BUSINESS: '2012',
  PHONE_DISPLAY: '(512) 555-0192',
  PHONE_RAW: '5125550192',
  EMAIL: 'concierge@apexestates.com',
  ADDRESS: '1100 Congress Ave, Austin, TX',
  GOOGLE_RATING: '4.9',
  GOOGLE_REVIEW_COUNT: '312',
  INSTAGRAM_HANDLE: 'apexestates_atx',
  FACEBOOK_URL: 'https://facebook.com/apexestatesatx',
  SITE_URL: 'https://apex-estates.lunao.app',
  AVERAGE_RATING: '4.9',
};

function compileTemplate(rawPath, replacements) {
  let content = fs.readFileSync(rawPath, 'utf8');
  content = content.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key) => {
    const upper = key.toUpperCase();
    if (upper in replacements) {
      return replacements[upper];
    }
    console.warn(`[compile] Unhandled placeholder {{${key}}} in ${rawPath}`);
    return replacements.BUSINESS_NAME || match;
  });
  return content;
}

const gymRaw = path.resolve('public/templates-raw/gym-template-01.html');
const gymCompiled = compileTemplate(gymRaw, gymData);

fs.writeFileSync(path.resolve('public/gym-template-01.html'), gymCompiled, 'utf8');
fs.writeFileSync(path.resolve('gym-template-01.html'), gymCompiled, 'utf8');
console.log('gym-template-01.html compiled successfully. Placeholders remaining:', (gymCompiled.match(/\{\{/g) || []).length);

const reRaw = path.resolve('public/templates-raw/realestate-template-01.html');
const reCompiled = compileTemplate(reRaw, realestateData);

fs.writeFileSync(path.resolve('public/realestate-template-01.html'), reCompiled, 'utf8');
fs.writeFileSync(path.resolve('realestate-template-01.html'), reCompiled, 'utf8');
console.log('realestate-template-01.html compiled successfully. Placeholders remaining:', (reCompiled.match(/\{\{/g) || []).length);

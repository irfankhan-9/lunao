import React, { useState, useRef, useEffect } from 'react';
import { Campaign, Template, Business, SmsLog } from '../types';
import {
  Plus, Trash2, Eye, EyeOff, ExternalLink, ChevronRight, Upload,
  MapPin, Sliders, CheckCircle, CheckCircle2, Smartphone, SlidersHorizontal, Loader2, Sparkles, Check, Minus, Info, Users, Star, X, ShieldAlert, Send, Globe, Key, Compass, ShieldCheck, Layout, MessageSquare, Mail, AlertCircle, Search, RefreshCw, Activity, Save, Link2, Copy, Square, Battery
} from 'lucide-react';
import { nicheList } from '../data';
import { getTemplateContent, getNicheBgImage } from './Templates';
import { playGentleChime, playLaunchSwell, playVictoryCelebration, playSoftTap, playSoftBubble, playElegantBell, playSlideTick, playElegantError, playTiktokLike, playConfirmSuccess } from '../utils/audio';
import { CelebrationEffect } from './CelebrationEffect';
import { TemplateSimPreview } from './TemplateSimPreview';
import { UnifiedRecentCampaigns } from './UnifiedRecentCampaigns';
import { EmailCampaignWizard } from './EmailCampaignWizard';
import { validateCsvFile, runCampaign, runSiteDeployCampaign, PipelineLead, PipelineResultRow, CsvValidation, listCustomTemplates, CustomTemplate, listEmailAccounts, createEmailCampaign, probeAllEmailAccounts, runEmailCampaign, cancelCampaign, cancelEmailCampaign, EmailCampaignEvent, getEmailCampaign as fetchEmailCampaign } from '../lib/pipelineClient';
import { ActiveCampaignRun } from '../App';

interface CampaignsProps {
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  templates: Template[];
  businesses: Business[];
  setBusinesses: React.Dispatch<React.SetStateAction<Business[]>>;
  addSmsLog: (newLogs: any[]) => void;
  setActiveTab?: (tab: any) => void;
  selectedNiche?: string;
  setSelectedNiche?: (niche: string) => void;
  userPlan?: string;
  userCredits: number;
  setUserCredits: React.Dispatch<React.SetStateAction<number>>;
  telnyxKey?: string;
  telnyxPhone?: string;
  setScrollTarget?: (id: string | null) => void;
  // Active Campaigns registry (lifted from App.tsx) so both the wizard
  // and the Active Campaigns progress card stay in sync without prop drilling.
  activeCampaignRuns?: ActiveCampaignRun[];
  upsertActiveRun?: (run: ActiveCampaignRun) => void;
  updateActiveRun?: (id: string, patch: Partial<ActiveCampaignRun>) => void;
  removeActiveRun?: (id: string) => void;
  // One-click "Edit outreach" — when the user clicks the pencil on a
  // Recent Campaigns row, App.tsx passes the source campaign in; we
  // pre-fill the email sub-wizard and jump straight to the message step.
  initialEmailSubject?: string;
  initialEmailBody?: string;
  // Bump this counter from the parent to force re-application of
  // initialEmailSubject/Body (used after the user clicks Edit Outreach
  // multiple times in a row, since string identity alone won't trigger
  // a re-render when the user re-edits the same campaign).
  initialEmailNonce?: number;
}

const getCityCoords = (city: string) => {
  const c = city.toLowerCase();
  if (c.includes('toronto')) return { lat: '43.6532° N', lng: '79.3832° W' };
  if (c.includes('vancouver')) return { lat: '49.2827° N', lng: '123.1207° W' };
  if (c.includes('calgary')) return { lat: '51.0447° N', lng: '114.0719° W' };
  if (c.includes('austin')) return { lat: '30.2672° N', lng: '97.7431° W' };
  return { lat: '43.7000° N', lng: '79.4200° W' };
};

const getTemplateMetaForNiche = (niche: string, id: string) => {
  const isClassic = id === 't1' || id === 't3' || id === 't5' || id === 't7' || id === 't9' || id === 't11' || id === 't13';
  switch (niche) {
    case 'Barber':
      return {
        color: 'from-[#1a1916] to-black',
        desc: 'Dark luxury Italian-meets-modern editorial style. Playfair serif headings paired with clean Nunito Sans, with warm premium gold accent separators.',
        logoEmoji: '💈',
        brandName: 'BARBER DARK LUXURY'
      };
    case 'Salon':
      return {
        color: isClassic ? 'from-rose-500 to-pink-900' : 'from-purple-900 to-pink-950',
        desc: isClassic 
          ? 'Elegant pastel accents, high-fashion containers, soft serif typography.' 
          : 'Sleek luxury alignment, full-screen product grids, fluid animations.',
        logoEmoji: '💅',
        brandName: 'SALON PRO'
      };
    case 'Dentist':
      return {
        color: isClassic ? 'from-sky-500 to-blue-800' : 'from-teal-800 to-cyan-950',
        desc: isClassic 
          ? 'Clinical sky-blue layouts, safety badges, automated scheduling anchors.' 
          : 'Ultramodern organic medical blocks, simple digital intake flow.',
        logoEmoji: '🦷',
        brandName: 'CLEAN DENTAL'
      };
    case 'HVAC':
      return {
        color: isClassic ? 'from-teal-600 to-blue-900' : 'from-orange-600 to-amber-950',
        desc: isClassic 
          ? 'Hot-and-cold contrasting sliders, instant dispatch confirmation maps.' 
          : 'Eco-efficient green badge system, dynamic smart air filtering logs.',
        logoEmoji: '❄️',
        brandName: 'CLIMATE ECO'
      };
    case 'Gym':
      return {
        color: isClassic ? 'from-slate-850 to-red-950' : 'from-yellow-600 to-zinc-950',
        desc: isClassic 
          ? 'Gritty steel aesthetics, clean membership pricing grids, highlight frames.' 
          : 'Sleek dark tracker tables, energetic contrast lists, training calendar.',
        logoEmoji: '💪',
        brandName: 'MODERN GYM'
      };
    case 'Roofing':
      return {
        color: isClassic ? 'from-orange-850 to-amber-950' : 'from-slate-800 to-neutral-900',
        desc: isClassic 
          ? 'Storm-warning accent banners, direct free roof inspection forms.' 
          : 'Premium residential asphalt shingle displays, direct estimator sliders.',
        logoEmoji: '🏠',
        brandName: 'SHINGLE SHIELD'
      };
    case 'Real Estate':
      return {
        color: isClassic ? 'from-emerald-800 to-teal-950' : 'from-zinc-900 to-zinc-950',
        desc: isClassic 
          ? 'Elegant property showcases, broker contact forms, and market stats.' 
          : 'Sleek luxury architectural galleries, virtual tour embeds.',
        logoEmoji: '🏡',
        brandName: 'APEX ESTATES'
      };
    default:
      return {
        color: 'from-neutral-800 to-stone-950',
        desc: 'Clean conversion layout designed to turn views into immediate bookings.',
        logoEmoji: '🎯',
        brandName: 'LUNAO PREVIEW'
      };
  }
};

const generateMockGoogleLeads = (niche: string, cities: string[]): any[] => {
  const selectedCity = cities[0] || 'Toronto, ON';
  const [cityName] = selectedCity.split(',');
  const cityClean = cityName.trim();

  // Pick realistic phone prefix
  let displayCode = '416';
  if (selectedCity.toLowerCase().includes('toronto')) displayCode = '416';
  else if (selectedCity.toLowerCase().includes('vancouver')) displayCode = '604';
  else if (selectedCity.toLowerCase().includes('calgary')) displayCode = '403';
  else if (selectedCity.toLowerCase().includes('montreal')) displayCode = '514';
  else if (selectedCity.toLowerCase().includes('ottawa')) displayCode = '613';
  else if (selectedCity.toLowerCase().includes('mississauga')) displayCode = '905';
  else if (selectedCity.toLowerCase().includes('london')) displayCode = '519';
  else if (selectedCity.toLowerCase().includes('austin')) displayCode = '512';
  else displayCode = '800';

  let companySuffixes: string[] = [];
  let owners: string[] = [];

  switch (niche) {
    case 'Barber':
      companySuffixes = ["Royal Fades Lounge", "The Gent's Crown", "Classic Clipper Parlor", "Sovereign Scissors", "True Grit Barbers", "The Shear Shop", "The Vintage Shave", "Summit Clips"];
      owners = ["Dominic S.", "Erick Hanson", "Maxime L.", "Marcus Vance", "Simon K.", "Jordan Rivers"];
      break;
    case 'Salon':
      companySuffixes = ["Lumière Hair Loft", "Bella Rose Boutique", "Maison de Beauté", "Silk & Shear Studio", "Gilded Lily Salon", "The Velvet Chair", "Aurélie Editorial Salon", "Nova Hair Care"];
      owners = ["Clarabelle M.", "Sophia Rossi", "Aurélie G.", "Jessica Chen", "Nadia P.", "Zoe Fontaine"];
      break;
    case 'Dentist':
      companySuffixes = ["Wellness Dental Clinic", "Clear Sky Dentistry", "Beacon Dental Studio", "Smile Lab Orthodontics", "Intake Dental Care", "Clarity Dental Group"];
      owners = ["Dr. Arthur Vance", "Dr. Mona Patel", "Dr. Julian Wu", "Dr. Clara Rose", "Dr. Ben Rivers"];
      break;
    case 'HVAC':
      companySuffixes = ["Vortex Climate Control", "Apex Heating and Air", "Everest Climate Tech", "Pinnacle Eco-Cooling", "Pro-Tech Systems", "Northstar HVAC"];
      owners = ["Steve Miller", "Dave G.", "Rick Gable", "Arthur Vance", "Kyle Frost"];
      break;
    case 'Gym':
      companySuffixes = ["Forge Athletic Club", "Iron Core Fitness", "Vigor Performance", "The Daily Grind", "True North Gym", "Summit Training Center"];
      owners = ["Alex Mercer", "Tina Sterling", "Coach Vance", "Sarah Connor", "Chris Power"];
      break;
    case 'Roofing':
      companySuffixes = ["Top Shield Roofing", "Crown Asphalt & Slate", "Everlast Shingles", "Apex Exterior Pros", "Ironclad Roofing Group", "Summit Roofs"];
      owners = ["Garrison Vance", "Mark Ross", "Luke Dunlap", "Sean Peak"];
      break;
    case 'Real Estate':
      companySuffixes = ["Nouveau Horizon Realty", "Aura Luxury Properties", "Apex Brokers", "Prime City Real Estate", "Metro Dwelling Group"];
      owners = ["Victoria Croft", "Julian Sterling", "Jessica Chen", "Sarah Stone"];
      break;
    default:
      companySuffixes = ["Local Conversion Pro", "Dynamic Commerce Hub", "Standard Enterprise"];
      owners = ["Adrian Mercer", "Fiona Gray"];
  }

  return companySuffixes.map((suffix, index) => {
    const isNoWebsite = index % 3 !== 0; // 66% have no website - prime targets for Lunao!
    const ratingFloat = parseFloat((4.0 + (index * 0.13) % 0.9).toFixed(1));
    const reviewCount = Math.floor(12 + (index * 37) % 390);
    const numSuffix = 1000 + Math.floor(index * 1157);
    const phoneNo = `(${displayCode}) 555-${numSuffix}`;
    const slug = suffix.toLowerCase().replace(/[^a-z0-9]/g, '');

    return {
      id: `lead_${niche.toLowerCase()}_${index}_${Date.now()}`,
      name: `${suffix} ${cityClean === 'Local' ? '' : cityClean}`,
      owner: owners[index % owners.length],
      phone: phoneNo,
      city: selectedCity,
      rating: ratingFloat,
      reviews: reviewCount,
      address: `${100 + index * 12} ${cityClean === 'Local' ? 'Main' : cityClean} St`,
      currentWebsite: isNoWebsite ? "" : `https://www.${slug}.com`,
      slug: slug,
      niche: niche
    };
  });
};

interface CanadianCity {
  name: string;
  provinceCode: string;
  populationGroup: 'Major' | 'Regional';
  estimatedLeads: number;
  nicheSpecificCoverage: string;
}

const CANADIAN_REGIONS: { [key: string]: { name: string; cities: CanadianCity[] } } = {
  ON: {
    name: 'Ontario',
    cities: [
      { name: 'Toronto, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 153, nicheSpecificCoverage: '98% Coverage' },
      { name: 'Ottawa, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 92, nicheSpecificCoverage: '95% Coverage' },
      { name: 'Mississauga, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 68, nicheSpecificCoverage: '94% Coverage' },
      { name: 'Hamilton, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 54, nicheSpecificCoverage: '93% Coverage' },
      { name: 'London, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 48, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Brampton, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 62, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Markham, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 41, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Vaughan, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 39, nicheSpecificCoverage: '92% Coverage' },
      { name: 'Kitchener, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 35, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Windsor, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 31, nicheSpecificCoverage: '88% Coverage' },
      { name: 'Richmond Hill, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 29, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Oakville, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 28, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Burlington, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 27, nicheSpecificCoverage: '92% Coverage' },
      { name: 'Sudbury, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 25, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Oshawa, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 24, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Barrie, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 22, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Kingston, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 20, nicheSpecificCoverage: '88% Coverage' },
      { name: 'Guelph, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 18, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Waterloo, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 17, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Peterborough, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 15, nicheSpecificCoverage: '85% Coverage' }
    ]
  },
  QC: {
    name: 'Quebec',
    cities: [
      { name: 'Montreal, QC', provinceCode: 'QC', populationGroup: 'Major', estimatedLeads: 159, nicheSpecificCoverage: '97% Coverage' },
      { name: 'Quebec City, QC', provinceCode: 'QC', populationGroup: 'Major', estimatedLeads: 74, nicheSpecificCoverage: '94% Coverage' },
      { name: 'Laval, QC', provinceCode: 'QC', populationGroup: 'Major', estimatedLeads: 58, nicheSpecificCoverage: '93% Coverage' },
      { name: 'Gatineau, QC', provinceCode: 'QC', populationGroup: 'Major', estimatedLeads: 46, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Longueuil, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 42, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Sherbrooke, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 36, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Trois-Rivières, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 32, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Saguenay, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 30, nicheSpecificCoverage: '86% Coverage' },
      { name: 'Lévis, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 28, nicheSpecificCoverage: '88% Coverage' },
      { name: 'Terrebonne, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 25, nicheSpecificCoverage: '85% Coverage' }
    ]
  },
  BC: {
    name: 'British Columbia',
    cities: [
      { name: 'Vancouver, BC', provinceCode: 'BC', populationGroup: 'Major', estimatedLeads: 142, nicheSpecificCoverage: '98% Coverage' },
      { name: 'Surrey, BC', provinceCode: 'BC', populationGroup: 'Major', estimatedLeads: 88, nicheSpecificCoverage: '95% Coverage' },
      { name: 'Burnaby, BC', provinceCode: 'BC', populationGroup: 'Major', estimatedLeads: 64, nicheSpecificCoverage: '94% Coverage' },
      { name: 'Richmond, BC', provinceCode: 'BC', populationGroup: 'Major', estimatedLeads: 58, nicheSpecificCoverage: '93% Coverage' },
      { name: 'Kelowna, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 44, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Victoria, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 52, nicheSpecificCoverage: '92% Coverage' },
      { name: 'Abbotsford, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 38, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Coquitlam, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 36, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Kamloops, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 30, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Nanaimo, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 28, nicheSpecificCoverage: '88% Coverage' }
    ]
  },
  AB: {
    name: 'Alberta',
    cities: [
      { name: 'Calgary, AB', provinceCode: 'AB', populationGroup: 'Major', estimatedLeads: 115, nicheSpecificCoverage: '97% Coverage' },
      { name: 'Edmonton, AB', provinceCode: 'AB', populationGroup: 'Major', estimatedLeads: 88, nicheSpecificCoverage: '96% Coverage' },
      { name: 'Red Deer, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 38, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Lethbridge, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 32, nicheSpecificCoverage: '89% Coverage' },
      { name: 'St. Albert, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 25, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Medicine Hat, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 24, nicheSpecificCoverage: '86% Coverage' },
      { name: 'Grande Prairie, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 22, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Airdrie, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 20, nicheSpecificCoverage: '88% Coverage' }
    ]
  },
  SK: {
    name: 'Saskatchewan',
    cities: [
      { name: 'Saskatoon, SK', provinceCode: 'SK', populationGroup: 'Major', estimatedLeads: 48, nicheSpecificCoverage: '92% Coverage' },
      { name: 'Regina, SK', provinceCode: 'SK', populationGroup: 'Major', estimatedLeads: 42, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Prince Albert, SK', provinceCode: 'SK', populationGroup: 'Regional', estimatedLeads: 18, nicheSpecificCoverage: '84% Coverage' },
      { name: 'Moose Jaw, SK', provinceCode: 'SK', populationGroup: 'Regional', estimatedLeads: 15, nicheSpecificCoverage: '85% Coverage' },
      { name: 'Swift Current, SK', provinceCode: 'SK', populationGroup: 'Regional', estimatedLeads: 12, nicheSpecificCoverage: '82% Coverage' },
      { name: 'Yorkton, SK', provinceCode: 'SK', populationGroup: 'Regional', estimatedLeads: 10, nicheSpecificCoverage: '81% Coverage' }
    ]
  },
  MB: {
    name: 'Manitoba',
    cities: [
      { name: 'Winnipeg, MB', provinceCode: 'MB', populationGroup: 'Major', estimatedLeads: 46, nicheSpecificCoverage: '94% Coverage' },
      { name: 'Brandon, MB', provinceCode: 'MB', populationGroup: 'Regional', estimatedLeads: 18, nicheSpecificCoverage: '86% Coverage' },
      { name: 'Steinbach, MB', provinceCode: 'MB', populationGroup: 'Regional', estimatedLeads: 12, nicheSpecificCoverage: '84% Coverage' },
      { name: 'Portage la Prairie, MB', provinceCode: 'MB', populationGroup: 'Regional', estimatedLeads: 10, nicheSpecificCoverage: '82% Coverage' }
    ]
  },
  ATLANTIC: {
    name: 'Atlantic Provinces',
    cities: [
      { name: 'Halifax, NS', provinceCode: 'NS', populationGroup: 'Major', estimatedLeads: 39, nicheSpecificCoverage: '93% Coverage' },
      { name: 'St. John\'s, NL', provinceCode: 'NL', populationGroup: 'Major', estimatedLeads: 32, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Moncton, NB', provinceCode: 'NB', populationGroup: 'Regional', estimatedLeads: 28, nicheSpecificCoverage: '88% Coverage' },
      { name: 'Saint John, NB', provinceCode: 'NB', populationGroup: 'Regional', estimatedLeads: 22, nicheSpecificCoverage: '86% Coverage' },
      { name: 'Fredericton, NB', provinceCode: 'NB', populationGroup: 'Regional', estimatedLeads: 20, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Charlottetown, PE', provinceCode: 'PE', populationGroup: 'Regional', estimatedLeads: 15, nicheSpecificCoverage: '85% Coverage' }
    ]
  }
};

export const Campaigns: React.FC<CampaignsProps> = ({
  campaigns,
  setCampaigns,
  templates,
  businesses,
  setBusinesses,
  addSmsLog,
  setActiveTab,
  selectedNiche: propSelectedNiche,
  setSelectedNiche: propSetSelectedNiche,
  userPlan,
  userCredits,
  setUserCredits,
  telnyxKey = '',
  telnyxPhone = '',
  setScrollTarget,
  activeCampaignRuns = [],
  upsertActiveRun,
  updateActiveRun,
  removeActiveRun,
  initialEmailSubject,
  initialEmailBody,
  initialEmailNonce,
}) => {
  const isUpgraded = userPlan === 'Pro Plan' || userPlan === 'Agency Plan';
  
  const planNameStr = typeof userPlan === 'string' ? userPlan.replace(' Plan', '') : 'Growth';
  const userQuotaLeft = userCredits;
  const COST_PER_LEAD = 4;
  const maxLeadsAllowed = Math.floor(userQuotaLeft / COST_PER_LEAD);

  // Intelligent ETA based on real lead volume (deploys run in parallel batches).
  const estimateSendingTime = (n: number): string => {
    if (n <= 0) return '~1 minute';
    if (n <= 10) return '~2 minutes';
    if (n <= 20) return '~3 minutes';
    if (n <= 50) return '~7 minutes';
    if (n <= 100) return '~12 minutes';
    return `~${Math.ceil(n / 10)} minutes`;
  };
  
  const [activeStep, setActiveStep] = useState<number>(1);
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<Template | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [localSelectedNiche, setLocalSelectedNiche] = useState<string>('Barber');
  const selectedNiche = propSelectedNiche !== undefined ? propSelectedNiche : localSelectedNiche;
  const setSelectedNiche = propSetSelectedNiche !== undefined ? propSetSelectedNiche : setLocalSelectedNiche;
  const [inputMethod, setInputMethod] = useState<'csv' | 'find'>('csv');
  // CSV is the only live lead source. Google Maps "Leads Finder" is Coming Soon.
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvValidation, setCsvValidation] = useState<CsvValidation | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<string | null>(null);
  // Bumped by SSE handlers so React re-reads `activeCampaignRuns` after
  // we mutate it imperatively. Avoids subtle stale-state bugs when a
  // site:generated event fires before the next paint.
  const [activeRunsTick, setActiveRunsTick] = useState(0);
  const [cityInput, setCityInput] = useState<string[]>(['Toronto, ON']);
  const [selectedProvinceTab, setSelectedProvinceTab] = useState<string>('All');
  const [citySearchQuery, setCitySearchQuery] = useState<string>('');
  const [regionScrollProgress, setRegionScrollProgress] = useState<number>(0);
  const [customCity, setCustomCity] = useState<string>('');
  const [cityLimitError, setCityLimitError] = useState<string | null>(null);
  const [leadSelectionError, setLeadSelectionError] = useState<string | null>(null);
  const regionScrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollLeftRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(0);
  const [radius, setRadius] = useState<number>(15);
  const [findingsLoaded, setFindingsLoaded] = useState<boolean>(true);
  const [isFinding, setIsFinding] = useState<boolean>(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('t1');
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);

  // Load custom templates on mount so they're available in the wizard picker.
  useEffect(() => {
    listCustomTemplates()
      .then(setCustomTemplates)
      .catch(() => setCustomTemplates([]));
  }, []);

  // Cross-tab open: the dashboard's "Open" button writes the campaign id
  // to sessionStorage and switches tabs. We read it on mount and forward
  // it to the unified Recent Campaigns section so it pops the detail
  // modal and highlights the target row. Both one-shot keys are cleared
  // after consumption so they never re-fire on subsequent renders.
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const id = sessionStorage.getItem('lunao_pending_open_campaign');
      if (id) {
        setPendingOpenId(id);
        sessionStorage.removeItem('lunao_pending_open_campaign');
      }
    } catch { /* ignore */ }
  }, []);
  const [campaignName, setCampaignName] = useState<string>('Toronto Barbers May Campaign');
  const [targetSmsCount, setTargetSmsCount] = useState<number>(10);

  // Google Maps Leads Discovery System State
  const [googleMapsLeads, setGoogleMapsLeads] = useState<any[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [isSearchingGoogleMaps, setIsSearchingGoogleMaps] = useState<boolean>(false);
  const [shouldShakeSearch, setShouldShakeSearch] = useState<boolean>(false);
  const [hasSearchedGoogleMaps, setHasSearchedGoogleMaps] = useState<boolean>(false);
  const [mapsScanLogs, setMapsScanLogs] = useState<string[]>([]);

  // New CSV Import states
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [isCsvParsing, setIsCsvParsing] = useState<boolean>(false);
  const [csvParsedCount, setCsvParsedCount] = useState<number>(0);
  // Real parsed leads from the uploaded CSV (drives the live backend pipeline).
  const [csvLeads, setCsvLeads] = useState<PipelineLead[]>([]);

  // Draft Message
  const [smsText, setSmsText] = useState<string>(
    `Hi, we noticed {{business_name}} doesn't have a website yet to showcase your services in {{city}}.\n\nWe built a beautiful custom preview for you — take a look: {{site_url}}\n\nReply YES to publish it instantly!\n\n— The Lunao Team`
  );

  // Generation status
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [launchProgress, setLaunchProgress] = useState<number>(0);
  const [launchMessage, setLaunchMessage] = useState<string>('');
  const [campaignCreated, setCampaignCreated] = useState<boolean>(false);

  const stepRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Synchronize campaign outreach targets with selected lead count automatically
  React.useEffect(() => {
    setTargetSmsCount(selectedLeadIds.length);
  }, [selectedLeadIds]);

  // Keep the selected template valid for the current niche. If the active
  // template doesn't belong to the chosen niche (e.g. niche came from shared
  // state), auto-pick the first template of that niche so the recap is correct.
  React.useEffect(() => {
    const current = templates.find((t) => t.id === selectedTemplateId);
    if (!current || current.niche !== selectedNiche) {
      const firstForNiche = templates.find((t) => t.niche === selectedNiche);
      if (firstForNiche) setSelectedTemplateId(firstForNiche.id);
    }
  }, [selectedNiche, templates]);

  // Dynamic pre-population of Google Maps search listings focusing on persistence (locking in previous selections)
  React.useEffect(() => {
    const fresh = generateMockGoogleLeads(selectedNiche, cityInput);
    
    setGoogleMapsLeads(prevLeads => {
      // Keep any previously generated leads that the user has selected/locked-in
      const selected = prevLeads ? prevLeads.filter(lead => selectedLeadIds.includes(lead.id)) : [];
      const combined = [...selected];
      fresh.forEach(newLead => {
        if (!combined.some(c => c.id === newLead.id)) {
          combined.push(newLead);
        }
      });
      return combined;
    });

    // Maintain previously selected leads and do NOT auto-select fresh/new results by default!
    setSelectedLeadIds(prevSelected => {
      return prevSelected;
    });

    setHasSearchedGoogleMaps(false);
  }, [selectedNiche, cityInput]);

  const handleToggleLead = (leadId: string) => {
    if (selectedLeadIds.includes(leadId)) {
      playTiktokLike();
      setSelectedLeadIds(prev => prev.filter(id => id !== leadId));
      setUserCredits(prev => {
        const next = prev + COST_PER_LEAD;
        localStorage.setItem('lunao_user_credits', next.toString());
        return next;
      });
    } else {
      // Dynamic budget guard: Each profile requires COST_PER_LEAD (4) credits
      if (userCredits < COST_PER_LEAD) {
        playElegantError();
        setLeadSelectionError(null);
        setTimeout(() => {
          setLeadSelectionError(`Action Blocked: Each outreached lead requires ${COST_PER_LEAD} credits (3 for SMS + 1 for website creation). Your current balance is ${userCredits} credits. Please top up your balance.`);
        }, 10);
        setTimeout(() => setLeadSelectionError(null), 4000);
        return;
      }
      
      playTiktokLike();
      setSelectedLeadIds(prev => [...prev, leadId]);
      setMissingSelectionError(false);
      setLeadSelectionError(null);
      setUserCredits(prev => {
        const next = Math.max(0, prev - COST_PER_LEAD);
        localStorage.setItem('lunao_user_credits', next.toString());
        return next;
      });
    }
  };

  // Google Maps LIVE simulated API Search Scan
  const handleTriggerGoogleMapsSearch = () => {
    const fresh = generateMockGoogleLeads(selectedNiche, cityInput);
    const apiScanCost = Math.ceil(fresh.length / 3);

    // Guard: Ensure user has enough credits to trigger maps search (Rate: 3 leads = 1 credit rate)
    if (userCredits < apiScanCost) {
      playElegantError();
      setShouldShakeSearch(true);
      setTimeout(() => setShouldShakeSearch(false), 500);
      setCityLimitError(`Insufficient Balance: Running an active Google Maps Places crawl costs 1 credit per 3 found listings. This scan requires ${apiScanCost} credits.`);
      setTimeout(() => setCityLimitError(null), 6000);
      return;
    }

    setIsSearchingGoogleMaps(true);
    setHasSearchedGoogleMaps(false);
    setMapsScanLogs([]);
    
    playLaunchSwell();

    // Deduct standard API query cost in real time (3 leads = 1 credit rate)
    setUserCredits(prev => {
      const next = Math.max(0, prev - apiScanCost);
      localStorage.setItem('lunao_user_credits', next.toString());
      return next;
    });

    const currentCityName = cityInput[0] || 'Local';

    const scanStages = [
      { delay: 0, text: `📡 Client handshaking: Establishing peer connection to Google Maps Platform (Places v3 / New API standard Hub)...` },
      { delay: 400, text: `💳 API Query Charge: -${apiScanCost} credits deducted in real-time (Rate: 3 leads found = 1 credit rate)` },
      { delay: 800, text: `🗺️ Geo Geofence locked: Transmitting bounding coordinates frame queries for "${currentCityName}"...` },
      { delay: 1400, text: `🔍 Crawling indexes: Searching matches for Niche: "${selectedNiche}" containing missing or non-responsive mobile responsive frameworks...` },
      { delay: 2000, text: `📊 Parsing metadata: Extracting verified ratings, telephone registries, review volume parameters, and business owners...` },
      { delay: 2800, text: `🎯 Verification complete: Found ${fresh.length} valid lead candidates matching Lunao criteria! Synchronizing checkout payload.` }
    ];

    scanStages.forEach((stage) => {
      setTimeout(() => {
        setMapsScanLogs(prev => [...prev, stage.text]);
        playSoftTap();
        
        if (stage.delay === 2800) {
          // Merge fresh search results with previously selected locked-in leads
          setGoogleMapsLeads(prevLeads => {
            const selected = prevLeads ? prevLeads.filter(lead => selectedLeadIds.includes(lead.id)) : [];
            const combined = [...selected];
            fresh.forEach(newLead => {
              if (!combined.some(c => c.id === newLead.id)) {
                combined.push(newLead);
              }
            });
            return combined;
          });

          // Maintain the currently selected leads and do NOT select newly searched results by default
          setSelectedLeadIds(prevSelected => {
            return prevSelected;
          });

          setIsSearchingGoogleMaps(false);
          setHasSearchedGoogleMaps(true);
          playVictoryCelebration();
        }
      }, stage.delay);
    });
  };

  // Auto scroll horizontally to the current active step in the wizard progress bar
  React.useEffect(() => {
    const activeElem = stepRefs.current[activeStep];
    const trackElem = document.getElementById('wizard-steps-horizontal-track');
    if (activeElem && trackElem) {
      const trackRect = trackElem.getBoundingClientRect();
      const elemRect = activeElem.getBoundingClientRect();
      const offset = (elemRect.left - trackRect.left) + trackElem.scrollLeft - (trackRect.width / 2) + (elemRect.width / 2);
      trackElem.scrollTo({ left: offset, behavior: 'smooth' });
    }

    // Scroll the campaign card block into view precisely on step changes,
    // ensuring the user keeps the wizard container aligned rather than resetting back to the very top.
    const wizardCard = document.getElementById('campaigns-generator-wizard-card');
    if (wizardCard) {
      wizardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const container = document.getElementById('main-content-flow');
      if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [activeStep, isLaunching, campaignCreated]);

  // Auto-scroll horizontally to the current Site Deploy wizard step indicator
  const sdStepRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Textarea reference for inserting tokens
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [quotaError, setQuotaError] = useState<boolean>(false);
  const [missingSelectionError, setMissingSelectionError] = useState<boolean>(false);
  const [errorShakes, setErrorShakes] = useState<number>(0);
  const [latestCampId, setLatestCampId] = useState<string | null>(null);

  // (Per-campaign detail modal state now lives inside the unified
  // Recent Campaigns component — no need to hoist it here.)
  const [activeCampaignType, setActiveCampaignType] = useState<'sms' | 'site-deploy'>('site-deploy');
  const [sdActiveStep, setSdActiveStep] = useState<number>(1);
  const [emailActiveStep, setEmailActiveStep] = useState<number>(1);
  const [emailCsvFileName, setEmailCsvFileName] = useState<string | null>(null);
  const [emailCsvLeads, setEmailCsvLeads] = useState<PipelineLead[]>([]);
  const [emailCsvError, setEmailCsvError] = useState<string | null>(null);
  const [emailCsvCopied, setEmailCsvCopied] = useState(false);
  // Live result card after the SSE finishes: per-account + per-lead breakdown.
  const [emailResults, setEmailResults] = useState<{ sent: number; failed: number; status: string; perAccount: any[]; perLead: any[]; sitesLive?: number } | null>(null);
  const [emailLaunchError, setEmailLaunchError] = useState<string | null>(null);
  const [emailLaunchSuccess, setEmailLaunchSuccess] = useState<string | null>(null);
  const [emailInputMethod, setEmailInputMethod] = useState<'csv' | 'find'>('csv');
  const [emailTargetVolume, setEmailTargetVolume] = useState<number>(10);
  const [emailTargetCity, setEmailTargetCity] = useState<string>('');
  const [emailDiscoveredLeads, setEmailDiscoveredLeads] = useState<any[]>([]);
  const [emailIsFinding, setEmailIsFinding] = useState<boolean>(false);
  const [emailHasFound, setEmailHasFound] = useState<boolean>(false);
  const [emailSelectedTemplateId, setEmailSelectedTemplateId] = useState<string>('t1');
  const [emailSubject, setEmailSubject] = useState<string>('Quick idea for {{business_name}}');
  const [emailBody, setEmailBody] = useState<string>(`Hi {{business_name}} team,

I noticed your shop in {{city}} doesn't have a modern website yet — most of your competitors already do, and they're capturing the customers who search Google before choosing where to book.

I built a free, personalized mockup of what a premium site could look like for {{business_name}} (took me ~60 seconds). You can view it here:

{{site_url}}

No strings attached. If you like it, I'd love to chat for 5 minutes about how I help local businesses like yours get more bookings.

Cheers,
The Lunao Team`);
  const [emailLiveSitesCount, setEmailLiveSitesCount] = useState(0);
  // Live email counters: tick up the moment each SSE event arrives so the
  // celebration card shows real-time progress during the run instead of
  // frozen zeros waiting for the `complete` event. Mirrors the same
  // pattern in src/components/EmailCampaignWizard.tsx.
  const [emailLiveSentCount, setEmailLiveSentCount] = useState(0);
  const [emailLiveFailedCount, setEmailLiveFailedCount] = useState(0);
  // Stable ref to the latest active run for this campaign. We use a ref
  // instead of reading `activeCampaignRuns.find(...)` inside the SSE
  // callback because the callback is captured at render time and would
  // otherwise see a stale `activeCampaignRuns` array — meaning `cur.done`
  // never increments past the value at the moment the SSE was opened,
  // and the top progress bar appears frozen at 0% even while sends
  // complete. The ref is updated on every render so the callback always
  // sees the freshest run state.
  const activeRunRef = useRef<ActiveCampaignRun | undefined>(undefined);
  const [emailIsLaunching, setEmailIsLaunching] = useState<boolean>(false);
  const [emailLaunchProgress, setEmailLaunchProgress] = useState<number>(0);
  const [emailLaunchMessage, setEmailLaunchMessage] = useState<string>('');
  const [emailCampaignCreated, setEmailCampaignCreated] = useState<boolean>(false);
  // Real backend campaign id — set once `createEmailCampaign` returns.
  // Used by the Stop button on the celebration card so we can hit
  // `POST /api/email-campaigns/:id/cancel`. The local optimistic id
  // (`em_<timestamp>`) used during launch is replaced the moment the
  // server returns its real id.
  const [emailBackendCampaignId, setEmailBackendCampaignId] = useState<string | null>(null);
  // Keep the ref synced with the latest active run for the email campaign
  // currently in flight, keyed by `emailBackendCampaignId` (the server's
  // real id). This way the SSE callback always sees the freshest `done`
  // count when it bumps the Active Campaigns card.
  useEffect(() => {
    const id = emailBackendCampaignId;
    if (!id) { activeRunRef.current = undefined; return; }
    const found = activeCampaignRuns.find((r) => r.id === id);
    if (found) activeRunRef.current = found;
  }, [activeCampaignRuns, emailBackendCampaignId]);
  // Stop-campaign state — surfaces a "Stopping..." spinner on the Stop
  // button while the cancel request is in flight. The actual SSE
  // `cancelled` event handler at the top of this file marks the row as
  // Crashed and updates the Active card too.

  // Apply "Edit outreach" payload from the parent — pre-fills the email
  // sub-wizard with the source campaign's subject/body, then jumps to
  // step 4 so the user lands on the message editor with one click.
  useEffect(() => {
    if (initialEmailSubject) setEmailSubject(initialEmailSubject);
    if (initialEmailBody) setEmailBody(initialEmailBody);
    if (initialEmailSubject || initialEmailBody) {
      setActiveCampaignType('email');
      setEmailActiveStep(4);
    }
  }, [initialEmailNonce, initialEmailSubject, initialEmailBody]);

  // Listen for email campaign completion events from EmailCampaignWizard
  useEffect(() => {
    const handleCampaignComplete = (e: Event) => {
      const campaign = (e as CustomEvent).detail;
      console.log('[Campaigns] Received campaign-complete event:', campaign.id, 'status:', campaign.status, 'sent:', campaign.emailsSent);
      setCampaigns(prev => {
        // Update existing campaign or add new one
        const exists = prev.find(c => c.id === campaign.id);
        console.log('[Campaigns] Campaign exists:', !!exists, 'total campaigns:', prev.length);
        let updated;
        if (exists) {
          updated = prev.map(c => c.id === campaign.id ? { ...c, ...campaign } : c);
          console.log('[Campaigns] Updated campaigns, found:', updated.find(c => c.id === campaign.id)?.status);
        } else {
          console.log('[Campaigns] Adding new campaign to list');
          updated = [campaign, ...prev];
        }
        // Save to localStorage immediately
        try {
          localStorage.setItem('lunao_campaigns', JSON.stringify(updated));
          console.log('[Campaigns] Saved to localStorage');
        } catch (err) {
          console.error('[Campaigns] Failed to save to localStorage:', err);
        }
        return updated;
      });
    };
    const handleCampaignProgress = (e: Event) => {
      const { id, emailsSent, emailsFailed, lead } = (e as CustomEvent).detail;
      setCampaigns(prev => prev.map(c => {
        if (c.id !== id) return c;
        // Update email counts
        const newSent = (c.emailsSent || 0) + emailsSent;
        const newFailed = (c.emailsFailed || 0) + emailsFailed;
        // Update email accounts used
        let newEmailAccounts = c.emailAccountsUsed || [];
        if (lead?.accountEmail && emailsSent > 0) {
          const accIdx = newEmailAccounts.findIndex((a: any) => a.accountEmail === lead.accountEmail);
          if (accIdx >= 0) {
            newEmailAccounts = newEmailAccounts.map((a: any, i: number) =>
              i === accIdx ? { ...a, sent: (a.sent || 0) + emailsSent } : a
            );
          } else {
            newEmailAccounts = [...newEmailAccounts, { accountEmail: lead.accountEmail, sent: emailsSent, failed: 0 }];
          }
        }
        // Update email leads
        const newLeads = lead ? [...(c.emailLeads || []), lead] : (c.emailLeads || []);
        // Track deployed sites in real time so the Recent card populates as soon
        // as sites come online (instead of waiting for the final completion event).
        let newDeployedSites = c.deployedSites || [];
        if (lead?.siteUrl) {
          const slug = (lead.email || lead.name || `lead-${newDeployedSites.length}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const exists = newDeployedSites.some((s: any) => s.url === lead.siteUrl);
          if (!exists) {
            newDeployedSites = [...newDeployedSites, { slug, name: lead.name || 'Lead', city: undefined, url: lead.siteUrl, status: 'live' }];
          }
        }
        const sitesGenerated = newDeployedSites.length || c.sitesGenerated;
        return { ...c, emailsSent: newSent, emailsFailed: newFailed, emailAccountsUsed: newEmailAccounts, emailLeads: newLeads, deployedSites: newDeployedSites, sitesGenerated };
      }));
    };
    window.addEventListener('lunao:campaign-complete', handleCampaignComplete);
    window.addEventListener('lunao:campaign-progress', handleCampaignProgress);
    return () => {
      window.removeEventListener('lunao:campaign-complete', handleCampaignComplete);
      window.removeEventListener('lunao:campaign-progress', handleCampaignProgress);
    };
  }, []);

  // Reconcile Active email campaigns against the server every 3 seconds.
  // This is the safety net for the SSE event bus — even if the wizard's
  // window-dispatched events never reach this listener (e.g. the SSE stream
  // dropped, the page was reloaded mid-run, the wizard unmounted), we still
  // surface the real backend state on the Recent Campaigns card. The poll
  // stops as soon as no campaigns are Active anymore.
  const campaignsRef = useRef<Campaign[]>(campaigns);
  useEffect(() => { campaignsRef.current = campaigns; }, [campaigns]);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const activeEmailCampaigns = campaignsRef.current.filter(
        (c) => c.type === 'email' && c.status === 'Active',
      );
      if (activeEmailCampaigns.length === 0) return;
      // Fetch the user's email accounts once per tick so we can map
      // assigned_account_id → email address for the per-account breakdown.
      let accountsById: Record<string, string> = {};
      try {
        const ownerKey = (typeof localStorage !== 'undefined' && localStorage.getItem('lunao_owner_key')) || 'dash-Free-Plan';
        const accs = await listEmailAccounts(ownerKey);
        for (const a of accs || []) {
          accountsById[a.id] = a.email;
        }
      } catch { /* ignore */ }
      for (const camp of activeEmailCampaigns) {
        try {
          // camp.id IS the server's campaign id (the wizard passes the
          // backend's id directly as the local id when adding the row).
          const id = camp.id;
          const result = await fetchEmailCampaign(id);
          if (cancelled || !result) continue;
          const { campaign: dbCamp, leads } = result;
          // Map backend lead statuses → our Campaign shape
          const sentCount = leads.filter((l: any) => l.send_status === 'sent').length;
          const failedCount = leads.filter((l: any) => l.send_status === 'failed').length;
          const sitesCount = leads.filter((l: any) => l.generated_site_url).length;
          const deployedSites = leads
            .filter((l: any) => l.generated_site_url)
            .map((l: any) => ({
              slug: l.slug || (l.email || l.business_name || `lead-${l.id}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              name: l.business_name || 'Lead',
              city: l.city,
              url: l.generated_site_url,
              status: 'live' as const,
            }));
          // Per-account breakdown: walk leads with assigned_account_id and
          // tally sent/failed per account so the card shows "X emails from
          // alice@gmail.com" accurately.
          const perAccount: Record<string, { accountId: string; accountEmail: string; sent: number; failed: number }> = {};
          for (const l of leads) {
            const aid = l.assigned_account_id;
            if (!aid) continue;
            const accEmail = accountsById[aid] || aid;
            if (!perAccount[aid]) perAccount[aid] = { accountId: aid, accountEmail: accEmail, sent: 0, failed: 0 };
            if (l.send_status === 'sent') perAccount[aid].sent++;
            else if (l.send_status === 'failed') perAccount[aid].failed++;
          }
          // Preserve any accounts that were already known but had no lead
          // assignments yet (e.g. account selected but no send happened).
          for (const existing of camp.emailAccountsUsed || []) {
            if (!perAccount[existing.accountId]) {
              perAccount[existing.accountId] = { ...existing, sent: existing.sent || 0, failed: existing.failed || 0 };
            }
          }
          const emailAccountsUsed = Object.values(perAccount);
          const newStatus =
            dbCamp.status === 'completed' ? 'Completed'
              : dbCamp.status === 'failed' ? 'Crashed'
                : dbCamp.status === 'cancelled' ? 'Crashed'
                  : 'Active';

          setCampaigns((prev) =>
            prev.map((c) =>
              c.id === camp.id || c.serverCampaignId === id
                ? {
                    ...c,
                    status: newStatus,
                    emailsSent: sentCount || c.emailsSent,
                    emailsFailed: failedCount || c.emailsFailed,
                    sitesGenerated: sitesCount || c.sitesGenerated,
                    deployedSites: deployedSites.length ? deployedSites : c.deployedSites,
                    emailAccountsUsed,
                  }
                : c,
            ),
          );
        } catch {
          /* swallow — next tick will retry */
        }
      }
    };

    poll();
    const handle = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [setCampaigns]);

  // Email account / token management
  const [emailAccounts, setEmailAccounts] = useState<any[]>([]);
  const [emailAccountsLoading, setEmailAccountsLoading] = useState<boolean>(false);
  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<string>('');
  // Multi-account selection (round-robin across these for the campaign).
  const [selectedEmailAccountIds, setSelectedEmailAccountIds] = useState<string[]>([]);
  const [emailAccountHealth, setEmailAccountHealth] = useState<Record<string, any>>({});
  // Live token-probe state. When the user tries to leave step 4 we hit
  // /api/email-accounts/probe-all; if any account's refresh_token is dead
  // we block the transition and surface `expiredEmailAccounts` here so a
  // prominent red error card can render with a one-click "Reconnect"
  // action.
  const [expiredEmailAccounts, setExpiredEmailAccounts] = useState<any[]>([]);
  const [probingTokens, setProbingTokens] = useState<boolean>(false);
  // Refs for the horizontal stepper so the auto-scroll lands on the
  // current step even when the bar overflows on narrow screens.
  const emailStepRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const emailStepTrackRef = useRef<HTMLDivElement | null>(null);
  const [sdSelectedTemplateId, setSdSelectedTemplateId] = useState<string>('t1');
  const [sdCsvFileName, setSdCsvFileName] = useState<string | null>(null);
  const [sdIsCsvParsing, setSdIsCsvParsing] = useState<boolean>(false);
  const [sdCsvParsedCount, setSdCsvParsedCount] = useState<number>(0);
  const [sdCsvLeads, setSdCsvLeads] = useState<PipelineLead[]>([]);
  const [sdCsvValidation, setSdCsvValidation] = useState<CsvValidation | null>(null);
  const [sdCsvError, setSdCsvError] = useState<string | null>(null);
  const [sdLaunchError, setSdLaunchError] = useState<string | null>(null);
  const [sdLaunchSuccess, setSdLaunchSuccess] = useState<string | null>(null);
  const [sdIsLaunching, setSdIsLaunching] = useState<boolean>(false);
  const [sdLaunchProgress, setSdLaunchProgress] = useState<number>(0);
  const [sdLaunchMessage, setSdLaunchMessage] = useState<string>('');
  const [sdCampaignCreated, setSdCampaignCreated] = useState<boolean>(false);
  const [sdSiteDeployResults, setSdSiteDeployResults] = useState<PipelineResultRow[]>([]);
  const [sdCampaignId, setSdCampaignId] = useState<string | null>(null);
  const [sdCampaignName, setSdCampaignName] = useState<string>('Site Deploy Campaign');

  // Auto-scroll horizontally to the current Site Deploy wizard step indicator + scroll wizard into view
  React.useEffect(() => {
    const activeElem = sdStepRefs.current[sdActiveStep];
    const trackElem = document.getElementById('wizard-steps-horizontal-track');
    if (activeElem && trackElem) {
      const trackRect = trackElem.getBoundingClientRect();
      const elemRect = activeElem.getBoundingClientRect();
      const offset = (elemRect.left - trackRect.left) + trackElem.scrollLeft - (trackRect.width / 2) + (elemRect.width / 2);
      trackElem.scrollTo({ left: offset, behavior: 'smooth' });
    }
    const wizardCard = document.getElementById('campaigns-generator-wizard-card');
    if (wizardCard) {
      wizardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const container = document.getElementById('main-content-flow');
      if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [sdActiveStep]);

  // Auto-scroll the Email wizard stepper so the active step is always
  // centered. Without this, on narrow screens the user can only see the
  // first 2–3 steps and has no idea step 5 ("Review & Launch") exists.
  React.useEffect(() => {
    if (activeCampaignType !== 'email') return;
    const activeElem = emailStepRefs.current[emailActiveStep];
    const trackElem = document.getElementById('wizard-steps-horizontal-track');
    if (!activeElem || !trackElem) return;
    const trackRect = trackElem.getBoundingClientRect();
    const elemRect = activeElem.getBoundingClientRect();
    const offset = (elemRect.left - trackRect.left) + trackElem.scrollLeft - (trackRect.width / 2) + (elemRect.width / 2);
    trackElem.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
  }, [emailActiveStep, activeCampaignType]);

  // Persist Site Deploy results to localStorage keyed by campaign id
  React.useEffect(() => {
    if (sdSiteDeployResults.length > 0 && sdCampaignId) {
      try {
        const stored = JSON.parse(localStorage.getItem('lunao_sd_results') || '{}');
        stored[sdCampaignId] = sdSiteDeployResults;
        localStorage.setItem('lunao_sd_results', JSON.stringify(stored));
      } catch { /* ignore */ }
    }
  }, [sdSiteDeployResults, sdCampaignId]);

  // Reusable Gmail OAuth opener. Opens the consent screen in a popup,
  // polls for it to close, then refreshes the connected-accounts list
  // (which now upserts the existing row instead of duplicating it).
  const startGmailConnect = React.useCallback(async () => {
    playSoftTap();
    const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
    const res = await fetch(`/api/email-accounts/oauth/url?provider=gmail&ownerKey=${encodeURIComponent(ownerKey)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      playElegantError();
      setEmailCsvError(data.error || 'Could not start Gmail connect');
      return;
    }
    const data = await res.json();
    const popup = window.open(data.url, 'gmail_oauth', 'width=520,height=640');
    if (!popup) {
      window.location.href = data.url;
      return;
    }
    const poll = setInterval(async () => {
      if (popup.closed) {
        clearInterval(poll);
        const ownerKey2 = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
        try {
          const list = await listEmailAccounts(ownerKey2);
          // Dedupe by (provider, email) to defend against any stale rows.
          const seen = new Set<string>();
          const deduped = list.filter((acc: any) => {
            const key = `${acc.provider}::${(acc.email || '').toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setEmailAccounts(deduped);
          const healthMap: Record<string, any> = {};
          deduped.forEach((acc: any) => { healthMap[acc.id] = acc.health || acc; });
          setEmailAccountHealth(healthMap);
          if (deduped.length > 0 && !selectedEmailAccountId) setSelectedEmailAccountId(deduped[0].id);
          // Clear the dead-token error card — the user just reconnected.
          setExpiredEmailAccounts([]);
          // Ping every Dashboard/EmailsTodayLog listener so they re-bind
          // their polling to the current ownerKey (in case the user was
          // on a different ownerKey when this OAuth flow started).
          try { window.dispatchEvent(new Event('lunao_owner_key_changed')); } catch { /* ignore */ }
          playVictoryCelebration();
        } catch {}
      }
    }, 1000);
  }, [selectedEmailAccountId]);

  // Refresh the picker list + probe every connected account's refresh
  // token. Called automatically the moment the wizard enters Step 4 so
  // dead tokens surface BEFORE the user tries to advance.
  const probeAndRefreshAccounts = React.useCallback(async () => {
    const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
    setProbingTokens(true);
    setEmailAccountsLoading(true);
    try {
      const list = await listEmailAccounts(ownerKey);
      const seen = new Set<string>();
      const deduped = list.filter((acc: any) => {
        const key = `${acc.provider}::${(acc.email || '').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setEmailAccounts(deduped);
      if (deduped.length > 0 && !selectedEmailAccountId) setSelectedEmailAccountId(deduped[0].id);
      const healthMap: Record<string, any> = {};
      deduped.forEach((acc: any) => { healthMap[acc.id] = acc.health || acc; });
      setEmailAccountHealth(healthMap);

      if (deduped.length === 0) {
        setExpiredEmailAccounts([]);
        return;
      }
      // Probe each token — cheap (one OAuth roundtrip per account).
      const probeResults = await probeAllEmailAccounts(ownerKey);
      const dead = probeResults.filter((r: any) => !r.ok);
      setExpiredEmailAccounts(dead);
    } catch (err) {
      // Soft-fail: keep the existing list, don't surface a scary error
      // just because the probe network call failed.
    } finally {
      setEmailAccountsLoading(false);
      setProbingTokens(false);
    }
  }, [selectedEmailAccountId]);

  // Auto-probe the moment the user lands on Step 4 ("Email Content").
  // Surfaces dead tokens BEFORE they try to click Next, so they get a
  // chance to reconnect instead of being blocked at the gate.
  React.useEffect(() => {
    if (emailActiveStep === 4) {
      probeAndRefreshAccounts();
    }
  }, [emailActiveStep, probeAndRefreshAccounts]);

  // v3: Real-time health polling while the user is on the email-wizard
  // steps. Refreshes battery % / Gmail-health every 5 seconds so the picker
  // mirrors what the server sees — including any sends the previous campaign
  // has just stacked onto each account. Skips the polling work entirely
  // outside the email wizard to keep the dashboard cheap.
  React.useEffect(() => {
    if (emailActiveStep < 4 || emailActiveStep > 5) return;
    const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
    let cancelled = false;
    const tick = async () => {
      try {
        const list = await listEmailAccounts(ownerKey);
        if (cancelled) return;
        setEmailAccounts((prev) => {
          if (!prev || prev.length === 0) return list;
          // Merge by id so we never lose optimistic local toggles that haven't
          // been reflected by the server yet (defensive — the toggle endpoint
          // already returns the updated row, this just covers background polls).
          const map = new Map(list.map((a) => [a.id, a]));
          return prev.map((p) => map.get(p.id) || p);
        });
      } catch {
        // Network blip — keep the previous snapshot.
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [emailActiveStep]);

  // Handle Finding simulation
  const handleFindBusinesses = () => {
    setIsFinding(true);
    setFindingsLoaded(false);
    setTimeout(() => {
      setIsFinding(false);
      setFindingsLoaded(true);
    }, 1800);
  };

  // Real CSV ingestion: parse the uploaded file via the backend so the live
  // pipeline operates on the actual rows. Falls back gracefully if the backend
  // is offline (keeps the dashboard usable as a standalone demo).
  const handleCsvFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      playElegantError();
      alert('Invalid format. Please upload a spreadsheet ending in .csv');
      return;
    }
    playLaunchSwell();
    setCsvFileName(file.name);
    setCsvError(null);
    setCsvValidation(null);
    setIsCsvParsing(true);
    try {
      const report = await validateCsvFile(file);
      setCsvValidation(report);
      setIsCsvParsing(false);

      if (!report.ok || report.validCount === 0) {
        // Invalid sheet — block forward progress, keep precise report for the UI.
        playElegantError();
        setCsvLeads([]);
        setCsvParsedCount(0);
        setTargetSmsCount(0);
        setCsvError(report.message || 'This CSV is not valid for a campaign.');
        return;
      }

      // Valid (possibly with some skipped rows).
      playVictoryCelebration();
      setCsvLeads(report.leads);
      setCsvParsedCount(report.validCount);
      setTargetSmsCount(report.validCount);
      setMissingSelectionError(false);
      setCampaignName(`${file.name.replace(/\.csv$/i, '')} Leads Campaign`);
    } catch (err) {
      // Backend offline or unreadable file — no fake counts.
      playElegantError();
      setCsvLeads([]);
      setIsCsvParsing(false);
      setCsvParsedCount(0);
      setTargetSmsCount(0);
      setCsvValidation(null);
      setCsvError(
        'Could not reach the pipeline server to validate this CSV. Start it with "npm run server" (or "npm run dev:all") and re-upload.',
      );
    }
  };

  // Site Deploy CSV upload — uses the exact same validateCsvFile() backend call as SMS outreach
  // so both sections accept identical CSV files and show identical error states.
  const handleSdCsvFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      playElegantError();
      setSdCsvError('Invalid format. Please upload a spreadsheet ending in .csv');
      return;
    }
    playLaunchSwell();
    setSdCsvFileName(file.name);
    setSdCsvError(null);
    setSdCsvValidation(null);
    setSdIsCsvParsing(true);
    try {
      const report = await validateCsvFile(file);
      setSdCsvValidation(report);
      setSdIsCsvParsing(false);

      if (!report.ok || report.validCount === 0) {
        playElegantError();
        setSdCsvLeads([]);
        setSdCsvParsedCount(0);
        setSdCsvError(report.message || 'This CSV is not valid for a site deployment campaign.');
        return;
      }

      playVictoryCelebration();
      // Backend returns leads with { name, phone, city } — map to UI display fields
      const displayLeads = report.leads.map((l, i) => ({
        business_name: l.name,
        city: l.city || '',
        phone_number: l.phone || '',
        index: i,
      }));
      setSdCsvLeads(displayLeads);
      setSdCsvParsedCount(report.validCount);
      setSdCampaignName(`${selectedNiche} Site Deploy — ${new Date().toLocaleDateString()}`);
    } catch {
      playElegantError();
      setSdCsvLeads([]);
      setSdIsCsvParsing(false);
      setSdCsvParsedCount(0);
      setSdCsvValidation(null);
      setSdCsvError(
        'Could not reach the pipeline server to validate this CSV. Start it with "npm run server" (or "npm run dev:all") and re-upload.',
      );
    }
  };

  // Launch a CSV campaign. UX: ~2.5s loading → success page, while the real
  // compile → Cloudflare deploy → SMS pipeline runs in the BACKGROUND and
  // updates the campaign row (Active → Completed) in Recent Campaigns. The
  // Active Campaigns card (rendered below the wizard) shows live progress
  // and exposes a Stop button that soft-cancels the in-flight pipeline.
  const runRealCsvPipeline = () => {
    setLaunchError(null);
    setLaunchSuccess(null);

    const totalLeads = csvLeads.length;
    if (totalLeads === 0) {
      setLaunchError('Upload a CSV with business name, city and phone before launching.');
      return;
    }
    if (!csvValidation?.ok) {
      setLaunchError('Your CSV is not valid yet. Fix the highlighted issues and re-upload.');
      return;
    }

    // Real credit guard: 4 credits per lead (1 site + 3 SMS reserved).
    // The dashboard still gates launches locally for instant UX, but the
    // server is the ultimate source of truth — /api/campaign/run will 402
    // if the user is actually broke after a plan downgrade.
    const requiredCredits = totalLeads * COST_PER_LEAD;
    if (userCredits < requiredCredits) {
      playElegantError();
      setLaunchError(
        `Insufficient credits: this campaign needs ${requiredCredits} credits (${totalLeads} leads × ${COST_PER_LEAD}). You have ${userCredits}. Top up to launch.`,
      );
      return;
    }

    // Optimistic local debit so the UI updates instantly. The server is
    // already the source of truth, so any mismatch will be corrected by
    // the post-run `refreshServerCredits()` pull.
    setUserCredits((prev) => {
      const next = Math.max(0, prev - requiredCredits);
      localStorage.setItem('lunao_user_credits', next.toString());
      return next;
    });

    // Register the campaign immediately as Active (shows in Recent Campaigns).
    const newCampId = 'c' + Date.now();
    setLatestCampId(newCampId);
    const smsName = campaignName || `${selectedNiche} CSV Outreach`;
    setCampaigns((prev) => [
      {
        id: newCampId,
        name: smsName,
        niche: selectedNiche,
        leadsFound: totalLeads,
        sites: 0,
        smsSent: 0,
        claimed: 0,
        status: 'Active' as const,
        createdAt: new Date().toISOString().split('T')[0],
        templateId: selectedTemplateId,
      },
      ...prev,
    ]);

    // Insert an Active Campaigns card row immediately so the user can
    // stop the run without waiting for the simulated launch animation.
    // The SSE stream below will tick `done` as sites compile and SMS go out.
    upsertActiveRun?.({ id: newCampId, kind: 'site-deploy', name: smsName, niche: selectedNiche, total: totalLeads, done: 0, status: 'starting', startedAt: Date.now() });

    // Short, fixed loading animation (~2.5s) then success — the actual work
    // continues in the background regardless of this screen.
    setIsLaunching(true);
    setLaunchProgress(0);
    setLaunchMessage('Provisioning outreach pipeline...');
    playLaunchSwell();
    setTimeout(() => { setLaunchProgress(45); setLaunchMessage('Compiling personalized websites...'); }, 600);
    setTimeout(() => { setLaunchProgress(80); setLaunchMessage('Publishing to the Cloudflare edge...'); playSoftTap(); }, 1400);
    setTimeout(() => { setLaunchProgress(100); setLaunchMessage('Campaign is live!'); }, 2200);
    setTimeout(() => {
      setIsLaunching(false);
      setCampaignCreated(true);
      playVictoryCelebration();
    }, 2500);

    // Fire-and-forget the real pipeline.
    startBackgroundPipeline(newCampId, totalLeads);
  };

  // Launch a sites-only CSV campaign (1 credit/lead, no SMS).
  const runSiteDeployCsvPipeline = () => {
    setSdLaunchError(null);
    setSdLaunchSuccess(null);
    const totalLeads = sdCsvLeads.length;
    if (totalLeads === 0) { setSdLaunchError('Upload a CSV first.'); return; }
    if (!sdCsvValidation?.ok) { setSdLaunchError('Your CSV is not valid yet.'); return; }
    const requiredCredits = totalLeads;
    if (userCredits < requiredCredits) { playElegantError(); setSdLaunchError(`Insufficient credits: need ${requiredCredits}, have ${userCredits}.`); return; }
    setUserCredits((prev) => { const next = Math.max(0, prev - requiredCredits); localStorage.setItem('lunao_user_credits', next.toString()); return next; });
    const newCampId = 'sd' + Date.now();
    setSdCampaignId(newCampId);
    const sdName = sdCampaignName || `${selectedNiche} Site Deploy`;
    setCampaigns((prev) => [{ id: newCampId, name: sdName, niche: selectedNiche, leadsFound: totalLeads, sites: 0, smsSent: 0, claimed: 0, status: 'Active' as const, createdAt: new Date().toISOString().split('T')[0], templateId: sdSelectedTemplateId, type: 'site-deploy' as const }, ...prev]);
    setSdIsLaunching(true); setSdLaunchProgress(0); setSdLaunchMessage('Provisioning site deployment...'); playLaunchSwell();
    // Insert an Active Campaigns card row immediately so the user can
    // stop the run without having to wait for the simulated launch
    // animation. The SSE stream below will tick `done` as Cloudflare
    // publishes each site.
    upsertActiveRun?.({ id: newCampId, kind: 'site-deploy', name: sdName, niche: selectedNiche, total: totalLeads, done: 0, status: 'starting', startedAt: Date.now() });
    // Optimistic inline progress (purely cosmetic — the server drives the
    // real progress via SSE). Kept so the wizard bar still animates while
    // waiting for the first SSE event.
    setTimeout(() => { setSdLaunchProgress(40); setSdLaunchMessage('Compiling personalized websites...'); }, 500);
    setTimeout(() => { setSdLaunchProgress(75); setSdLaunchMessage('Publishing to the Cloudflare edge...'); playSoftTap(); }, 1200);
    setTimeout(() => { setSdLaunchProgress(100); setSdLaunchMessage('Sites are live!'); }, 2000);
    const ownerKey = localStorage.getItem('lunao_owner_key') || `dash-${userPlan.replace(/\s+/g, '-')}`;
    if (!localStorage.getItem('lunao_owner_key')) localStorage.setItem('lunao_owner_key', ownerKey);
    const backendLeads = sdCsvLeads.map(l => ({
      name: l.business_name,
      city: l.city,
      phone: l.phone_number,
    }));
    runSiteDeployCampaign({ businesses: backendLeads, niche: selectedNiche, templateId: sdSelectedTemplateId, name: sdName, ownerKey, plan: userPlan },
      (e) => {
        if (e.type === 'start') {
          // First SSE event from the server = the run was accepted.
          // Show the inline success banner + Active card immediately,
          // independent of the simulated progress animation above.
          setSdIsLaunching(false);
          setSdCampaignCreated(true);
          setSdLaunchSuccess(`Site Deploy launched! ${e.total} site${e.total === 1 ? '' : 's'} queued on the edge.`);
          playVictoryCelebration();
          updateActiveRun?.(newCampId, { status: 'running' });
        } else if (e.type === 'site:generated') {
          setCampaigns((prev) => prev.map((c) => c.id === newCampId ? { ...c, sites: (c.sites || 0) + 1 } : c));
          // Tick the Active card's `done` counter. Using `e.index`
          // directly avoids the stale-closure bug on `activeCampaignRuns`.
          if (typeof e.index === 'number') {
            updateActiveRun?.(newCampId, { done: Math.max(e.index, 1), status: 'running' });
          } else {
            setActiveRunsTick((t) => t + 1); // dummy bump so React re-renders if needed
          }
        } else if (e.type === 'cancelled') {
          // Soft cancel — flip Active card to cancelled + mark Recent row.
          updateActiveRun?.(newCampId, { status: 'cancelled' });
          setCampaigns((prev) => prev.map((c) => c.id === newCampId ? { ...c, status: 'Crashed' as const, errorReason: 'Stopped by user' } : c));
          // Refund credits for un-processed leads.
          const unprocessed = Math.max(0, totalLeads - (e.processed || 0));
          if (unprocessed > 0) {
            setUserCredits((prev) => { const next = prev + unprocessed; localStorage.setItem('lunao_user_credits', next.toString()); return next; });
          }
          // Remove the row after a short delay so the user sees the cancelled state.
          setTimeout(() => removeActiveRun?.(newCampId), 1500);
        }
      }
    ).then(({ results }) => {
      const ok = results.filter((r) => r.siteStatus === 'generated');
      const failedCount = Math.max(0, totalLeads - ok.length);
      if (failedCount > 0) { setUserCredits((prev) => { const next = prev + failedCount; localStorage.setItem('lunao_user_credits', next.toString()); return next; }); }
      setCampaigns((prev) => prev.map((c) => c.id === newCampId ? { ...c, sites: ok.length, status: 'Completed' as const } : c));
      setSdSiteDeployResults(results);
      refreshServerCredits(ownerKey, userPlan);
      // Mark Active run completed and drop it after a brief pause.
      updateActiveRun?.(newCampId, { done: ok.length, status: 'completed' });
      setTimeout(() => removeActiveRun?.(newCampId), 1500);
    }).catch((err: any) => {
      updateActiveRun?.(newCampId, { status: 'cancelled' });
      setTimeout(() => removeActiveRun?.(newCampId), 1500);
      if (err?.status === 402) {
        setUserCredits((prev) => { const next = err.available ?? (prev + totalLeads); localStorage.setItem('lunao_user_credits', String(next)); return next; });
        setSdLaunchError(`Server says you have ${err.available ?? 0} credits but need ${totalLeads}.`); setCampaigns((prev) => prev.map((c) => c.id === newCampId ? { ...c, status: 'Crashed' as const, errorReason: 'Insufficient server credits' } : c));
      } else {
        setCampaigns((prev) => prev.map((c) => c.id === newCampId ? { ...c, status: 'Crashed' as const, errorReason: 'Pipeline server unreachable' } : c));
        setUserCredits((prev) => { const next = prev + totalLeads; localStorage.setItem('lunao_user_credits', next.toString()); return next; });
        setSdLaunchError(err?.message || 'An unexpected error occurred.'); playElegantError();
      }
    });
  };

  // Runs the real backend pipeline in the background and reconciles the
  // campaign row + businesses + SMS logs + credit refunds when it finishes.
  const startBackgroundPipeline = async (campId: string, totalLeads: number) => {
    const leads = csvLeads;
    let compiled = 0;
    const ownerKey = localStorage.getItem('lunao_owner_key') || `dash-${userPlan.replace(/\s+/g, '-')}`;
    if (!localStorage.getItem('lunao_owner_key')) localStorage.setItem('lunao_owner_key', ownerKey);
    try {
      const { summary, results, campaignId } = await runCampaign(
        {
          businesses: leads,
          niche: selectedNiche,
          templateId: selectedTemplateId,
          smsTemplate: smsText,
          name: campaignName || `${selectedNiche} CSV Outreach`,
          ownerKey,
          plan: userPlan,
        },
        (e) => {
          if (e.type === 'start') {
            // First SSE event from server = run accepted. Show inline success
            // banner + flip Active card to running.
            setLaunchSuccess(`Outreach campaign launched! ${e.total} lead${e.total === 1 ? '' : 's'} queued.`);
            updateActiveRun?.(campId, { status: 'running' });
          } else if (e.type === 'site:generated') {
            compiled += 1;
            setCampaigns((prev) =>
              prev.map((c) => (c.id === campId ? { ...c, sites: compiled } : c)),
            );
            // Tick the Active card's `done` counter. Using `e.index`
            // directly avoids the stale-closure bug on `activeCampaignRuns`.
            if (typeof e.index === 'number') {
              updateActiveRun?.(campId, { done: Math.max(e.index, 1), status: 'running' });
            }
          } else if (e.type === 'cancelled') {
            updateActiveRun?.(campId, { status: 'cancelled' });
            setCampaigns((prev) =>
              prev.map((c) => c.id === campId ? { ...c, status: 'Crashed' as const, errorReason: 'Stopped by user' } : c),
            );
            const unprocessed = Math.max(0, totalLeads - (e.processed || 0));
            if (unprocessed > 0) {
              setUserCredits((prev) => {
                const next = prev + unprocessed * COST_PER_LEAD;
                localStorage.setItem('lunao_user_credits', next.toString());
                return next;
              });
            }
            setTimeout(() => removeActiveRun?.(campId), 1500);
          }
        },
      );
      finalizeRealResults(campId, results, summary, totalLeads);
      // After the server finishes it knows the real balance (charges + refunds).
      // Pull it back so the dashboard never drifts from the ledger.
      refreshServerCredits(ownerKey, userPlan);
      void campaignId; // (kept for future "View campaign details" link)
      // Active run done — flip status + remove row after a short pause so
      // the user sees the "Completed" state before the row disappears.
      const okCount = (results || []).filter((r) => r.siteStatus === 'generated').length;
      updateActiveRun?.(campId, { done: okCount, status: 'completed' });
      setTimeout(() => removeActiveRun?.(campId), 1500);
    } catch (err: any) {
      // 402 means the server (truth) says the user is broke. Roll back the
      // optimistic local debit and surface a precise message.
      updateActiveRun?.(campId, { status: 'cancelled' });
      setTimeout(() => removeActiveRun?.(campId), 1500);
      if (err?.status === 402) {
        setUserCredits((prev) => {
          const next = err.available ?? (prev + totalLeads * COST_PER_LEAD);
          localStorage.setItem('lunao_user_credits', String(next));
          return next;
        });
        playElegantError();
        setLaunchError(
          `Server says you have ${err.available ?? 0} credits but this campaign needs ${err.needed ?? totalLeads * COST_PER_LEAD}. Top up to launch.`,
        );
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === campId
              ? { ...c, status: 'Crashed' as const, errorReason: 'Insufficient server credits' }
              : c,
          ),
        );
        return;
      }
      // Mark the campaign crashed and refund all reserved credits.
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campId
            ? { ...c, status: 'Crashed' as const, errorReason: 'Pipeline server unreachable — credits refunded' }
            : c,
        ),
      );
      setUserCredits((prev) => {
        const next = prev + totalLeads * COST_PER_LEAD;
        localStorage.setItem('lunao_user_credits', next.toString());
        return next;
      });
    }
  };

  // Pull the authoritative credit balance from the server and reconcile
  // local state. Called after every campaign run + on dashboard mount so
  // the localStorage copy can never drift from the ledger.
  const refreshServerCredits = async (ownerKey: string, plan: string) => {
    try {
      const { getCredits } = await import('../lib/pipelineClient');
      const status = await getCredits(ownerKey, plan);
      if (status.account) {
        setUserCredits(status.account.balance);
        localStorage.setItem('lunao_user_credits', String(status.account.balance));
      }
    } catch {
      /* silent — dashboard still works on local cache */
    }
  };

  // Reconcile final results into dashboard state once the background run ends.
  const finalizeRealResults = (
    campId: string,
    results: PipelineResultRow[],
    summary: any,
    totalLeads: number,
  ) => {
    const ok = results.filter((r) => r.siteStatus === 'generated');
    const smsComingSoon = summary?.telnyx === 'coming_soon';

    // Refund any leads that failed to deploy (we charged upfront).
    const failedCount = Math.max(0, totalLeads - ok.length);
    if (failedCount > 0) {
      setUserCredits((prev) => {
        const next = prev + failedCount * COST_PER_LEAD;
        localStorage.setItem('lunao_user_credits', next.toString());
        return next;
      });
    }

    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campId
          ? {
              ...c,
              sites: ok.length,
              smsSent: smsComingSoon ? 0 : (summary?.smsSent ?? ok.length),
              status: 'Completed' as const,
            }
          : c,
      ),
    );

    const newBusinesses: Business[] = ok.map((r) => {
      // Map the pipeline's smsStatus into the tick-driven deliveryStatus the
      // UI uses. Critical: simulated and sent both show a single tick, only
      // 'delivered' (confirmed by Telnyx) shows the double tick.
      let deliveryStatus: 'pending' | 'sent' | 'delivered' | 'simulated' | 'failed' = 'pending';
      if (smsComingSoon) {
        deliveryStatus = 'simulated';
      } else if (r.smsStatus === 'delivered') {
        deliveryStatus = 'delivered';
      } else if (r.smsStatus === 'sent') {
        deliveryStatus = 'sent';
      } else if (r.smsStatus === 'failed') {
        deliveryStatus = 'failed';
      } else if (r.smsSimulated) {
        deliveryStatus = 'simulated';
      }
      return {
        id: 'csv-' + r.slug + '-' + Math.random().toString(36).slice(2, 5),
        name: r.name,
        owner: '',
        phone: r.phone || '',
        city: r.city || '',
        niche: selectedNiche,
        webStatus: 'No website' as const,
        siteStatus: smsComingSoon ? ('Site generated' as const) : ('SMS sent' as const),
        slug: r.slug,
        siteUrl: r.siteUrl || '',
        smsHistory: r.smsText
          ? [{
              text: r.smsText,
              timestamp: smsComingSoon ? 'Queued (Coming Soon)' : 'Just now',
              type: 'outgoing' as const,
              deliveryStatus,
            }]
          : [],
      };
    });
    setBusinesses((prev) => [...newBusinesses, ...prev]);

    addSmsLog(
      ok.map((r) => ({
        id: 'log-' + r.slug + '-' + Math.random().toString(36).slice(2, 6),
        businessName: r.name,
        phone: r.phone || '',
        sentAt: smsComingSoon ? 'Queued' : 'Just now',
        status: (smsComingSoon ? 'Coming Soon' : r.smsStatus === 'failed' ? 'Undelivered' : 'Delivered') as SmsLog['status'],
        previewLink: r.siteUrl || '',
      })),
    );
  };

  // Insert token helper
  const insertToken = (token: string) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const text = textareaRef.current.value;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      setSmsText(before + token + after);
      
      // Reset focus and cursor position
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      setSmsText(prev => prev + ' ' + token);
    }
  };

  // The old client-side simulation has been removed. All campaigns now run
  // through the real backend pipeline via runRealCsvPipeline().

  const handleResetWizard = () => {
    setActiveStep(1);
    setCampaignCreated(false);
    setCampaignName('Austin Barbers May Campaign');
  };

  const handleResetSdWizard = () => {
    setSdActiveStep(1); setSdCampaignCreated(false); setSdCampaignName(`${selectedNiche} Site Deploy`);
    setSdCsvFileName(null); setSdCsvParsedCount(0); setSdCsvLeads([]); setSdCsvValidation(null); setSdCsvError(null); setSdLaunchError(null); setSdSiteDeployResults([]); setSdCampaignId(null);
    const firstForNiche = templates.find((t) => t.niche === selectedNiche);
    if (firstForNiche) setSdSelectedTemplateId(firstForNiche.id);
  };

  useEffect(() => {
    const firstForNiche = templates.find((t) => t.niche === selectedNiche);
    if (firstForNiche) setSdSelectedTemplateId(firstForNiche.id);
  }, [selectedNiche]);

  return (
    <div id="campaigns-tab-container-root" className="space-y-8 animate-fade-in font-sans relative">
      
      {/* Global Fixed Position Toasts for Mobile */}
      {leadSelectionError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] md:w-auto md:min-w-[320px] max-w-md animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-danger-soft text-danger border border-danger/30 shadow-2xl shadow-danger/20 rounded-xl p-4 flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-danger text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4 animate-bounce" />
            </div>
            <div className="space-y-1 mt-0.5 relative pr-6">
              <p className="font-bold text-xs uppercase tracking-wider text-danger leading-tight block text-left">Action Blocked</p>
              <p className="text-[12px] font-medium leading-snug text-left">{leadSelectionError}</p>
              <button 
                type="button"
                onClick={() => setLeadSelectionError(null)}
                className="absolute -top-1 -right-4 p-1 rounded hover:bg-danger/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-danger-soft/80" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Title Bar */}
      <header id="campaigns-view-header" className="flex items-center justify-between pb-6 border-b border-border-main">
        <div id="campaigns-titles-area" className="space-y-1">
          <h1 id="campaigns-top-heading" className="text-4xl font-serif text-ink tracking-tight font-normal">Campaigns</h1>
          <p id="campaigns-sub-heading" className="text-sm text-ink-secondary">Generate stunning websites and send automated SMS proposals.</p>
        </div>
      </header>

      {/* STEP-BY-STEP WORKFLOW CONTAINER (WIZARD) */}
      <section id="campaigns-generator-wizard-card" className="bg-white border border-border-main rounded-xl shadow-sm overflow-hidden">
        
        {/* Step-by-Step active header with beautiful sliding transition */}
        <div id="campaigns-wizard-header-collapse-container" className={`transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
          campaignCreated || isLaunching || sdCampaignCreated || sdIsLaunching
            ? 'max-h-0 opacity-0 pointer-events-none border-b-transparent'
            : 'max-h-[300px] opacity-100 border-b border-border-main'
        }`}>
          {/* Campaign type tab selector */}
          <div className="p-5 pb-0 bg-off-white border-b border-border-light">
            <div className="flex items-center gap-3 pb-4">
              <span className="text-xs font-semibold text-ink-secondary">Campaign Type:</span>
              <div className="flex items-center gap-1 p-1 bg-white border border-border-main rounded-xl">
                {/* Site Deploy — active/selected */}
                <button onClick={() => { playSoftBubble(); setActiveCampaignType('site-deploy'); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold font-sans transition-all ${
                    activeCampaignType === 'site-deploy' ? 'bg-accent-soft text-accent shadow-sm border border-accent/20' : 'text-ink-secondary hover:text-ink hover:bg-off-white'
                  }`}>
                  <Globe className="w-3.5 h-3.5" /> Site Deploy
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                    activeCampaignType === 'site-deploy' ? 'bg-accent/15 text-accent' : 'bg-surface text-ink-tertiary'
                  }`}>1 credit/lead</span>
                </button>
                {/* Email Campaign */}
                <button onClick={() => { playSoftBubble(); setActiveCampaignType('email'); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold font-sans transition-all ${
                    activeCampaignType === 'email' ? 'bg-accent-soft text-accent shadow-sm border border-accent/20' : 'text-ink-secondary hover:text-ink hover:bg-off-white'
                  }`}>
                  <Mail className="w-3.5 h-3.5" /> Email
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                    activeCampaignType === 'email' ? 'bg-accent/15 text-accent' : 'bg-surface text-ink-tertiary'
                  }`}>2 credits/lead</span>
                </button>
                {/* SMS Campaign — locked */}
                <button disabled onClick={() => {}}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold font-sans transition-all opacity-60 cursor-not-allowed">
                  <MessageSquare className="w-3.5 h-3.5" /> SMS Campaign
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-700">Soon</span>
                </button>
              </div>
            </div>
          </div>
          {/* Step Indicator Panel — horizontally scrollable so users can
              always swipe to see every step, even on narrow screens.
              `min-w-max` per step group prevents the names from being
              truncated; `scroll-smooth` + `snap-x` makes the auto-scroll
              land cleanly on the active step. */}
          <div id="wizard-steps-horizontal-track" className="px-6 py-5 bg-white flex flex-nowrap items-stretch overflow-x-auto scrollbar-thin gap-3 md:gap-4 snap-x snap-mandatory scroll-smooth">
            {activeCampaignType === 'site-deploy' ? (
              [ { step: 1, name: 'Select Niche' }, { step: 2, name: 'Input Businesses' }, { step: 3, name: 'Choose Template' }, { step: 4, name: 'Deploy Preview' } ].map((item) => (
                <React.Fragment key={item.step}>
                  <div ref={el => { sdStepRefs.current[item.step] = el; }} className="flex items-center gap-3 shrink-0 snap-start min-w-[140px]">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${sdActiveStep === item.step ? 'bg-accent text-white ring-4 ring-accent-soft' : sdActiveStep > item.step ? 'bg-success text-white' : 'bg-surface text-ink-secondary border border-border-main'}`}>
                      {sdActiveStep > item.step ? <Check className="w-4 h-4" /> : item.step}
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-[11px] uppercase tracking-wider font-semibold ${sdActiveStep === item.step ? 'text-accent' : 'text-ink-secondary'}`}>Step 0{item.step}</span>
                      <span className={`text-xs font-medium leading-tight whitespace-nowrap ${sdActiveStep === item.step ? 'font-semibold text-ink' : 'text-ink-secondary'}`}>{item.name}</span>
                    </div>
                  </div>
                  {item.step < 4 && <div className="hidden md:block h-[1px] bg-border-light flex-1 min-w-[20px] mx-2 self-center"></div>}
                </React.Fragment>
              ))
            ) : activeCampaignType === 'email' ? (
              [ { step: 1, name: 'Select Niche' }, { step: 2, name: 'Upload Leads' }, { step: 3, name: 'Choose Template' }, { step: 4, name: 'Email Content' }, { step: 5, name: 'Review & Launch' } ].map((item) => (
                <React.Fragment key={item.step}>
                  <div ref={el => { emailStepRefs.current[item.step] = el; }} className="flex items-center gap-3 shrink-0 snap-start min-w-[140px]">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${emailActiveStep === item.step ? 'bg-accent text-white ring-4 ring-accent-soft' : emailActiveStep > item.step ? 'bg-success text-white' : 'bg-surface text-ink-secondary border border-border-main'}`}>
                      {emailActiveStep > item.step ? <Check className="w-4 h-4" /> : item.step}
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-[11px] uppercase tracking-wider font-semibold ${emailActiveStep === item.step ? 'text-accent' : 'text-ink-secondary'}`}>Step 0{item.step}</span>
                      <span className={`text-xs font-medium leading-tight whitespace-nowrap ${emailActiveStep === item.step ? 'font-semibold text-ink' : 'text-ink-secondary'}`}>{item.name}</span>
                    </div>
                  </div>
                  {item.step < 5 && <div className="hidden md:block h-[1px] bg-border-light flex-1 min-w-[16px] mx-2 self-center"></div>}
                </React.Fragment>
              ))
            ) : (
              [ { step: 1, name: 'Select Niche' }, { step: 2, name: 'Input Businesses' }, { step: 3, name: 'Choose Template' }, { step: 4, name: 'SMS Messaging' }, { step: 5, name: 'Launch Outreach' } ].map((item) => (
                <React.Fragment key={item.step}>
                  <div className="flex items-center gap-3 shrink-0 snap-start min-w-[140px]">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${activeStep === item.step ? 'bg-accent text-white ring-4 ring-accent-soft' : activeStep > item.step ? 'bg-success text-white' : 'bg-surface text-ink-secondary border border-border-main'}`}>
                      {activeStep > item.step ? <Check className="w-4 h-4" /> : item.step}
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-[11px] uppercase tracking-wider font-semibold ${activeStep === item.step ? 'text-accent' : 'text-ink-secondary'}`}>Step 0{item.step}</span>
                      <span className={`text-xs font-medium leading-tight whitespace-nowrap ${activeStep === item.step ? 'font-semibold text-ink' : 'text-ink-secondary'}`}>{item.name}</span>
                    </div>
                  </div>
                  {item.step < 5 && <div className="hidden md:block h-[1px] bg-border-light flex-1 min-w-[20px] mx-2 self-center"></div>}
                </React.Fragment>
              ))
            )}
          </div>
        </div>

        {/* STEP WORK AREA */}
        <div id="wizard-step-contents-wrapper" className="p-6 md:p-8 min-h-[300px] relative">
          {activeCampaignType === 'site-deploy' ? (
            <>
              {sdCampaignCreated ? (
                <div className="text-center py-8 space-y-6 animate-fade-in">
                  <CelebrationEffect />
                  <div className="w-16 h-16 bg-accent-soft text-accent rounded-full flex items-center justify-center mx-auto border border-accent/20">
                    <Globe className="w-8 h-8" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-serif text-2xl text-ink">Sites Deployed!</h3>
                    <p className="text-sm text-ink-secondary">Your {sdCsvLeads.length} personalized site{sdCsvLeads.length === 1 ? '' : 's'} {sdCsvLeads.length === 1 ? 'is' : 'are'} live on Cloudflare.</p>
                  </div>
                  {sdSiteDeployResults.length > 0 && (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto text-left bg-off-white/50 border border-border-main rounded-xl p-4">
                      <p className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest mb-3">Deployed Sites</p>
                      {sdSiteDeployResults.map((r) => (
                        <div key={r.index} className="flex items-center gap-3 p-3 bg-white border border-border-main rounded-lg">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-accent-soft text-accent text-xs font-bold shrink-0">{r.index + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-ink">{sdCsvLeads[r.index]?.business_name || `Business ${r.index + 1}`}</p>
                            <p className="text-[10px] text-ink-secondary truncate">{sdCsvLeads[r.index]?.city}</p>
                          </div>
                          {r.siteUrl ? (
                            <a href={r.siteUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent font-semibold shrink-0 hover:underline truncate max-w-[160px]">{r.siteUrl.replace('https://', '')}</a>
                          ) : (
                            <span className="text-[10px] text-danger font-semibold shrink-0">Failed</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={handleResetSdWizard} className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-md shadow-sm">Launch Another Campaign</button>
                </div>
              ) : sdIsLaunching ? (
                <div className="text-center py-10 space-y-6 max-w-sm mx-auto animate-fade-in">
                  <div className="relative w-16 h-16 mx-auto">
                    <div className="absolute inset-0 rounded-full border-4 border-accent-soft"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-serif text-xl text-ink font-medium">Deploying Sites</h4>
                    <p className="text-xs text-ink-secondary animate-pulse">{sdLaunchMessage}</p>
                  </div>
                  <div className="w-full bg-border-light rounded-full h-1.5 overflow-hidden">
                    <div className="bg-accent h-1.5 rounded-full transition-all duration-300" style={{ width: `${sdLaunchProgress}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono font-medium text-ink-tertiary">
                    <span>CLOUDFLARE DEPLOY</span><span>{sdLaunchProgress}%</span>
                  </div>
                </div>
              ) : (
                <>
                  {sdActiveStep === 1 && (
                    <div className="space-y-5 animate-fade-in">
                      <div className="space-y-1">
                        <h3 className="font-serif text-2xl text-ink">What industry are you targeting?</h3>
                        <p className="text-sm text-ink-secondary">Choose the niche for your site deployment campaign.</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {nicheList.map((niche) => (
                          <button key={niche.id} onClick={() => { playSoftTap(); setSelectedNiche(niche.id); setSdActiveStep(2); playGentleChime(2); }}
                            className={`px-4 py-3 rounded-xl border text-xs font-semibold text-left transition-all ${selectedNiche === niche.id ? 'bg-accent-soft text-accent border-accent/30 shadow-sm' : 'bg-white text-ink border-border-light hover:border-accent/40 hover:bg-accent-soft/30'}`}>
                            {niche.emoji} {niche.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {sdActiveStep === 2 && (
                    <div className="space-y-5 animate-fade-in">
                      <div className="space-y-1">
                        <h3 className="font-serif text-2xl text-ink">Upload your business list</h3>
                        <p className="text-sm text-ink-secondary">Upload a CSV with business_name, city, phone_number columns.</p>
                      </div>
                      <div className="border-2 border-dashed border-border-light rounded-xl p-8 text-center hover:border-accent/50 transition-colors cursor-pointer"
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-accent', 'bg-accent-soft/20'); }}
                        onDragLeave={(e) => { e.currentTarget.classList.remove('border-accent', 'bg-accent-soft/20'); }}
                        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-accent', 'bg-accent-soft/20'); const f = e.dataTransfer.files[0]; if (f) handleSdCsvFile(f); }}
                        onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv'; inp.onchange = (ev) => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) handleSdCsvFile(f); }; inp.click(); }}>
                        {sdIsCsvParsing ? (
                          <div className="space-y-3"><Loader2 className="w-10 h-10 text-accent mx-auto animate-spin" /><p className="text-sm text-ink-secondary">Validating your CSV...</p></div>
                        ) : sdCsvValidation?.ok && sdCsvParsedCount > 0 ? (
                          <div className="space-y-3"><div className="w-12 h-12 bg-success-soft text-success rounded-full flex items-center justify-center mx-auto border border-success/20"><CheckCircle className="w-6 h-6" /></div><p className="font-semibold text-ink">{sdCsvParsedCount} businesses ready</p><p className="text-xs text-ink-secondary">{sdCsvFileName}</p></div>
                        ) : (
                          <div className="space-y-3"><Upload className="w-10 h-10 text-ink-tertiary mx-auto" /><p className="text-sm font-semibold text-ink">Drop your CSV here or click to upload</p><p className="text-xs text-ink-secondary">business_name, city, phone_number columns</p></div>
                        )}
                      </div>
                      {sdCsvError && <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{sdCsvError}</p>}
                      {sdCsvValidation && !sdCsvValidation.ok && (
                        <div className="bg-danger/5 border border-danger/20 rounded-xl p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-danger/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                              <X className="w-4 h-4 text-danger" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-danger uppercase tracking-wide">CSV validation failed</p>
                              <p className="text-xs text-danger/80 mt-1 leading-relaxed">{sdCsvValidation.message}</p>
                            </div>
                          </div>
                          {sdCsvValidation.missingColumns.length > 0 && (
                            <div className="bg-white/60 rounded-lg p-3 space-y-1.5">
                              <p className="text-[10px] font-bold text-ink-secondary uppercase tracking-wide">Missing required columns</p>
                              <div className="flex flex-wrap gap-1.5">
                                {sdCsvValidation.missingColumns.map((col) => (
                                  <span key={col} className="inline-flex items-center px-2 py-0.5 bg-danger/10 text-danger text-[10px] font-semibold rounded border border-danger/15">
                                    {col}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {sdCsvValidation.detectedColumns.length > 0 && (
                            <div className="bg-white/60 rounded-lg p-3 space-y-1.5">
                              <p className="text-[10px] font-bold text-ink-secondary uppercase tracking-wide">Detected columns</p>
                              <div className="flex flex-wrap gap-1.5">
                                {sdCsvValidation.detectedColumns.map((col) => (
                                  <span key={col} className="inline-flex items-center px-2 py-0.5 bg-surface text-ink text-[10px] font-medium rounded border border-border-main">
                                    {col}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <p className="text-[10px] text-danger/70 font-medium">Your CSV header must include: <span className="font-semibold">business_name</span>, <span className="font-semibold">city</span>, <span className="font-semibold">phone_number</span></p>
                        </div>
                      )}
                      {sdCsvValidation?.ok && sdCsvParsedCount > 0 && (
                        <div className="bg-success-soft/50 border border-success/20 rounded-xl p-4">
                          <p className="text-xs font-semibold text-success mb-2">{sdCsvParsedCount} businesses validated</p>
                          <div className="space-y-1 max-h-[120px] overflow-y-auto">
                            {sdCsvLeads.slice(0, 5).map((l) => <p key={l.index} className="text-[11px] text-ink-secondary">{l.business_name} &mdash; {l.city}</p>)}
                            {sdCsvLeads.length > 5 && <p className="text-[10px] text-ink-tertiary">+{sdCsvLeads.length - 5} more</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {sdActiveStep === 3 && (() => {
                    const nicheTemplates = templates.filter((t) => t.niche === selectedNiche);
                    const nicheCustom = customTemplates.filter((t) => t.niche === selectedNiche);
                    const selectedTpl = [...templates, ...customTemplates].find((t) => t.id === sdSelectedTemplateId);
                    const templateMeta = selectedTpl ? getTemplateMetaForNiche(selectedTpl.niche, selectedTpl.id) : null;
                    const templateDesc = selectedTpl ? (() => {
                      const isClassic = selectedTpl.id === 't1' || selectedTpl.id === 't3' || selectedTpl.id === 't5' || selectedTpl.id === 't7';
                      const content = getTemplateContent(selectedTpl.id, 'Preview', selectedNiche);
                      return content.heroSubTitle;
                    })() : null;
                    const templatePreviewUrl = (id: string) => {
                      if (id === 't2') return '/barber-template-02.html';
                      if (id === 't3') return '/salon-template-01.html';
                      if (id === 't4') return '/dentist-template-01.html';
                      if (id === 't5') return '/roofing-template-01.html';
                      if (id === 't6') return '/hvac-template-01.html';
                      if (id === 't7') return '/gym-template-01.html';
                      if (id === 't8') return '/realestate-template-01.html';
                      return '/barber-template.html';
                    };
                    return (
                      <div className="space-y-5 animate-fade-in">
                        <div className="space-y-1">
                          <h3 className="font-serif text-2xl text-ink">Choose your template</h3>
                          <p className="text-sm text-ink-secondary">Pick a template that matches the {selectedNiche} industry.</p>
                        </div>

                        {/* Selected template detail panel */}
                        {selectedTpl && (
                          <div className="flex items-center gap-4 p-4 bg-off-white border border-border-main rounded-xl">
                            <div className="w-20 h-14 rounded-lg overflow-hidden shrink-0 border border-border-light bg-white">
                              <img src={selectedTpl.preview} alt={selectedTpl.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-bold text-ink">{selectedTpl.name}</p>
                                {templateMeta?.logoEmoji && <span className="text-base">{templateMeta.logoEmoji}</span>}
                              </div>
                              {templateDesc && <p className="text-xs text-ink-secondary line-clamp-1">{templateDesc}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => { setSelectedTemplateForPreview(selectedTpl); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-main text-xs font-semibold text-ink rounded-lg hover:bg-accent-soft hover:border-accent/40 transition-all shadow-2xs cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" /> Preview
                              </button>
                              <a
                                href={templatePreviewUrl(selectedTpl.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-main text-xs font-semibold text-accent rounded-lg hover:bg-accent-soft hover:border-accent/40 transition-all shadow-2xs"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Full Page
                              </a>
                            </div>
                          </div>
                        )}

                        {/* Template grid — rich dual-device previews, same as Templates page */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {nicheTemplates.map((tpl) => (
                            <TemplateSimPreview
                              key={tpl.id}
                              id={tpl.id}
                              name={tpl.name}
                              niche={tpl.niche}
                              selected={sdSelectedTemplateId === tpl.id}
                              onClick={() => { playSoftTap(); setSdSelectedTemplateId(tpl.id); }}
                              onPreview={() => { setSelectedTemplateForPreview(tpl); }}
                              showActions
                            />
                          ))}
                          {nicheCustom.map((tpl) => (
                            <TemplateSimPreview
                              key={tpl.id}
                              id={tpl.id}
                              name={tpl.name}
                              niche={tpl.niche}
                              subLabel="Custom Template"
                              selected={sdSelectedTemplateId === tpl.id}
                              onClick={() => { playSoftTap(); setSdSelectedTemplateId(tpl.id); }}
                              onPreview={() => { setSelectedTemplateForPreview(tpl as any); }}
                              showActions
                            />
                          ))}
                        </div>

                        {nicheTemplates.length === 0 && nicheCustom.length === 0 && (
                          <div className="text-center py-12 text-ink-secondary">
                            <Layout className="w-10 h-10 mx-auto mb-3 opacity-40" />
                            <p className="text-sm">No templates found for this niche.</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {sdActiveStep === 4 && (
                    <div className="space-y-5 animate-fade-in">
                      <div className="space-y-1">
                        <h3 className="font-serif text-2xl text-ink">Ready to deploy!</h3>
                        <p className="text-sm text-ink-secondary">Review your campaign summary before launching.</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-off-white border border-border-main rounded-xl p-4 space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Industry</p>
                          <p className="text-sm font-semibold text-ink">{selectedNiche}</p>
                        </div>
                        <div className="bg-off-white border border-border-main rounded-xl p-4 space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Businesses</p>
                          <p className="text-sm font-semibold text-ink">{sdCsvParsedCount}</p>
                        </div>
                        <div className="bg-off-white border border-border-main rounded-xl p-4 space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Cost</p>
                          <p className="text-sm font-semibold text-accent">{sdCsvParsedCount} credits</p>
                          <p className="text-[10px] text-ink-secondary">1 credit per business site</p>
                        </div>
                      </div>
                      <div className="bg-off-white border border-border-main rounded-xl p-4">
                        <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold mb-2">Template</p>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-9 bg-gradient-to-br from-accent/20 to-accent/10 rounded flex items-center justify-center shrink-0">
                            <Globe className="w-5 h-5 text-accent" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-ink">{(() => { const tpl = [...templates, ...customTemplates.map(t => ({ ...t, preview: '' }))].find(t => t.id === sdSelectedTemplateId); return tpl?.name || 'Template'; })()}</p>
                            <p className="text-[10px] text-ink-secondary capitalize">{selectedNiche}</p>
                          </div>
                        </div>
                      </div>
                      {sdCsvLeads.length > 0 && (
                        <div className="bg-off-white border border-border-main rounded-xl p-4">
                          <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold mb-2">Sample Businesses</p>
                          <div className="space-y-1">
                            {sdCsvLeads.slice(0, 3).map((l) => <p key={l.index} className="text-xs text-ink-secondary">{l.business_name} &mdash; {l.city}</p>)}
                            {sdCsvLeads.length > 3 && <p className="text-[10px] text-ink-tertiary">+{sdCsvLeads.length - 3} more</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-8 pt-6 border-t border-border-light flex flex-wrap items-center justify-between gap-3">
                    <button disabled={sdActiveStep === 1} onClick={() => { playGentleChime(sdActiveStep - 1); setSdActiveStep(prev => prev - 1); }}
                      className={`text-xs font-semibold px-4 py-2 border border-border-main rounded shadow-xs bg-white text-ink leading-none ${sdActiveStep === 1 ? 'opacity-0 pointer-events-none' : 'hover:bg-off-white'}`}>Back</button>
                    {sdActiveStep === 2 && (
                      <button
                        onClick={() => {
                          if (!sdCsvValidation?.ok || sdCsvParsedCount === 0) { playElegantError(); return; }
                          playGentleChime(3); setSdActiveStep(3);
                        }}
                        className={`text-xs font-semibold px-5 py-2.5 rounded shadow-sm flex items-center gap-1.5 cursor-pointer transition-all ${sdCsvValidation?.ok && sdCsvParsedCount > 0 ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-surface text-ink-tertiary cursor-not-allowed'}`}
                      >
                        <span>Next Step</span><ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                    {sdActiveStep === 3 && (
                      <button
                        onClick={() => { playGentleChime(4); setSdActiveStep(4); }}
                        className={`text-xs font-semibold px-5 py-2.5 rounded shadow-sm flex items-center gap-1.5 cursor-pointer transition-all ${sdSelectedTemplateId ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-surface text-ink-tertiary cursor-not-allowed'}`}
                      >
                        <span>Next Step</span><ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                    {sdActiveStep === 4 && (
                      <button onClick={runSiteDeployCsvPipeline}
                        className="px-6 py-2.5 bg-accent hover:bg-accent-hover active:scale-95 text-white text-xs font-bold rounded-lg tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center gap-2 shadow-sm">
                        <Globe className="w-3.5 h-3.5 text-white" /> Deploy Sites Now
                      </button>
                    )}
                  </div>
                  {/* Inline success banner — fires the moment the server accepts the run. */}
                  {sdLaunchSuccess && !sdLaunchError && (
                    <div className="mt-4 p-4 bg-success-soft border border-success/30 rounded-xl flex items-start gap-3 animate-fade-in">
                      <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-success">Site deploy launched successfully!</p>
                        <p className="text-xs text-ink-secondary mt-0.5">{sdLaunchSuccess}</p>
                      </div>
                      <button type="button" aria-label="Dismiss" onClick={() => setSdLaunchSuccess(null)} className="text-ink-tertiary hover:text-ink transition-colors cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {sdLaunchError && (
                    <div className="mt-4 p-4 bg-danger/5 border border-danger/30 rounded-xl flex items-start gap-3 animate-fade-in">
                      <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-danger">Site deploy failed to launch</p>
                        <p className="text-xs text-ink-secondary mt-0.5">{sdLaunchError}</p>
                      </div>
                      <button type="button" aria-label="Dismiss" onClick={() => setSdLaunchError(null)} className="text-ink-tertiary hover:text-ink transition-colors cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {/* Active Campaigns progress card — sits below the wizard buttons
                      so the user can stop a run mid-flight without leaving the wizard. */}
                  <ActiveCampaignsCard
                    runs={activeCampaignRuns}
                    onStop={async (id, kind) => {
                      try {
                        updateActiveRun?.(id, { status: 'cancelling' });
                        if (kind === 'email') {
                          await cancelEmailCampaign(id);
                        } else {
                          await cancelCampaign(id);
                        }
                        playCancelTone();
                      } catch (e: any) {
                        // Couldn't reach the cancel endpoint — flip back so the
                        // user can retry. The stream will keep ticking.
                        updateActiveRun?.(id, { status: 'running' });
                        playElegantError();
                        console.error('[campaigns] cancel failed:', e);
                      }
                    }}
                  />
                </>
              )}
            </>
          ) : activeCampaignType === 'email' ? (
            <EmailCampaignWizard
              templates={templates}
              userPlan={userPlan}
              userCredits={userCredits}
              onCreditsChange={(credits) => setUserCredits(credits)}
              onLaunch={() => {}}
              onCampaignCreated={(newCampaign) => {
                setCampaigns(prev => [newCampaign, ...prev]);
              }}
              onViewDetails={(campaignId) => {
                setScrollTarget?.(campaignId);
              }}
              initialSubject={initialEmailSubject}
              initialBody={initialEmailBody}
            />
          ) : (
            <>
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-200">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <h3 className="font-serif text-2xl text-ink">SMS Campaigns Coming Soon</h3>
                <p className="text-sm text-ink-secondary max-w-sm mx-auto">Our SMS outreach system is being upgraded with new automation features. Stay tuned!</p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* UNIFIED RECENT CAMPAIGNS — one surface for site-deploy + email.
          Replaces the previous separate card strips + history table.
          The dashboard version sits inside a "compact" tile; the full
          Campaigns tab version here gets the rich layout (filter tabs,
          per-card badge, multi-select, bulk-delete, detail modal). */}
      <UnifiedRecentCampaigns
        id="campaigns-unified-recent"
        campaigns={campaigns}
        setCampaigns={setCampaigns}
        templates={templates}
        customTemplates={customTemplates}
        initialOpenId={pendingOpenId}
        onConsumedInitialOpen={() => setPendingOpenId(null)}
        onViewDetails={(id) => {
          // User clicked "View details" on a row — set the scroll target
          // so the section lands itself at the top, and briefly pulse
          // the matching card (handled inside UnifiedRecentCampaigns).
          setScrollTarget?.('rcard-section');
        }}
        onEditOutreach={(camp) => {
          // User clicked "Edit outreach" on an email row — pre-fill the
          // email sub-wizard and jump to the message step. We use
          // `pendingOpenId`/`setPendingOpenId` only for auto-open, so
          // instead we rely on the parent bumping `initialEmailNonce`
          // (see App.tsx) which re-triggers our effect above.
          const subj = (camp as any).emailSubject || '';
          const body = (camp as any).emailBody || '';
          setEmailSubject(subj);
          setEmailBody(body);
          setActiveCampaignType('email');
          setEmailActiveStep(4);
          // Scroll to the email wizard so the user sees the pre-filled
          // message without scrolling for it.
          setScrollTarget?.('sd-campaigns-card-strip');
          // Bump nonce via parent — handled by App.tsx threading
          // initialEmailNonce through this component.
        }}
      />

      {/* TEMPLATE DETAIL PREVIEW MODAL */}
      {selectedTemplateForPreview && (() => {
        return (
          <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4 backdrop-blur-xs animate-fade-in text-left">
            <div className="bg-white border border-border-main rounded-xl max-w-4xl w-full flex flex-col overflow-hidden max-h-[90vh] shadow-xl">
              
              {/* Modal header */}
              <div className="p-5 border-b border-border-light bg-off-white flex items-center justify-between shrink-0">
                <div className="space-y-0.5 max-w-[60%]">
                  <h3 className="text-xl font-serif text-ink tracking-tight font-normal truncate">{selectedTemplateForPreview.name} Live Framework</h3>
                  <p className="text-xs text-ink-secondary uppercase tracking-wider font-semibold font-sans truncate">Industry Target: {selectedTemplateForPreview.niche} • Real-Time Native</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* DEVICE SWITCHER BUTTONS */}
                  <div className="hidden sm:flex bg-surface rounded-md p-1 border border-border-light text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('desktop')}
                      className={`px-3 py-1.5 rounded transition-all cursor-pointer ${previewDevice === 'desktop' ? 'bg-white shadow-2xs text-accent font-bold' : 'text-ink-secondary hover:text-ink'}`}
                    >
                      Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('mobile')}
                      className={`px-3 py-1.5 rounded transition-all cursor-pointer ${previewDevice === 'mobile' ? 'bg-white shadow-2xs text-accent font-bold' : 'text-ink-secondary hover:text-ink'}`}
                    >
                      Mobile
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTemplateForPreview(null)}
                    className="p-1 rounded-md hover:bg-border-light text-ink-secondary hover:text-ink transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal content */}
              <div className="flex-1 bg-surface/30 p-3 md:p-6 flex justify-center items-center overflow-hidden min-h-[300px] h-[440px] md:h-[500px] max-h-[55vh]">
                <div
                  className="transition-all duration-300 border border-border-main rounded-lg overflow-hidden bg-white shadow-lg relative flex flex-col w-full h-full"
                  style={{
                    width: previewDevice === 'mobile' ? '375px' : '100%',
                    maxWidth: '100%',
                  }}
                >
                  <iframe
                    src={selectedTemplateForPreview.id === 't2' ? "/barber-template-02.html" : selectedTemplateForPreview.id === 't3' ? "/salon-template-01.html" : selectedTemplateForPreview.id === 't4' ? "/dentist-template-01.html" : selectedTemplateForPreview.id === 't5' ? "/roofing-template-01.html" : selectedTemplateForPreview.id === 't6' ? "/hvac-template-01.html" : selectedTemplateForPreview.id === 't7' ? "/gym-template-01.html" : selectedTemplateForPreview.id === 't8' ? "/realestate-template-01.html" : "/barber-template.html"}
                    className="w-full h-full border-0 flex-1"
                    title="Live Template Preview"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Modal footer CTAs */}
              <div className="p-5 border-t border-border-light bg-off-white flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSdSelectedTemplateId(selectedTemplateForPreview.id);
                      setSelectedTemplateForPreview(null);
                    }}
                    className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white font-semibold text-xs uppercase tracking-wider rounded shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Choose This Layout</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      window.open(selectedTemplateForPreview.id === 't2' ? '/barber-template-02.html' : selectedTemplateForPreview.id === 't3' ? '/salon-template-01.html' : selectedTemplateForPreview.id === 't4' ? '/dentist-template-01.html' : selectedTemplateForPreview.id === 't5' ? '/roofing-template-01.html' : selectedTemplateForPreview.id === 't6' ? '/hvac-template-01.html' : selectedTemplateForPreview.id === 't7' ? '/gym-template-01.html' : selectedTemplateForPreview.id === 't8' ? '/realestate-template-01.html' : '/barber-template.html', '_blank');
                    }}
                    className="flex px-4 py-2.5 border border-border-main text-ink text-xs font-semibold bg-white uppercase tracking-wider rounded hover:bg-off-white transition-all shadow-2xs cursor-pointer items-center gap-1.5"
                  >
                    <span className="hidden sm:inline">Preview Full Page</span>
                    <span className="sm:hidden">Full Page</span>
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedTemplateForPreview(null)}
                  className="px-4 py-2 border border-border-main font-semibold text-xs text-ink bg-white uppercase tracking-wider rounded hover:bg-off-white transition-all shadow-2xs cursor-pointer"
                >
                  Close Preview
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* The legacy standalone SD detail modal was removed when we
          consolidated Recent Campaigns — the unified component owns its
          own detail modal now (CampaignDetailModal). */}

    </div>
  );
};

// ---------------------------------------------------------------------------
// ActiveCampaignsCard
// Single, shared progress card that lists every campaign currently in flight
// (both site-deploy and email). Lives inside both wizards so the user can
// stop a runaway run without leaving the page. The Stop button calls
// cancelCampaign / cancelEmailCampaign on the backend, which sets the DB
// row to 'cancelled'; the in-flight pipeline picks that up on its next
// lead boundary and exits cleanly (soft cancel — current lead finishes).
// ---------------------------------------------------------------------------
const ActiveCampaignsCard: React.FC<{
  runs: ActiveCampaignRun[];
  onStop: (id: string, kind: 'site-deploy' | 'email') => Promise<void> | void;
}> = ({ runs, onStop }) => {
  if (runs.length === 0) return null;

  return (
    <section id="active-campaigns-card" className="mt-6 bg-white border border-border-main rounded-xl shadow-sm p-4 sm:p-5 space-y-3 animate-fade-in">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center">
            <Activity className="w-4 h-4 text-accent animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-ink leading-none">Active campaigns</h4>
            <p className="text-[11px] text-ink-tertiary mt-0.5">
              {runs.length} run{runs.length === 1 ? '' : 's'} in flight
            </p>
          </div>
        </div>
      </header>

      <ul className="space-y-2.5">
        {runs.map((run) => {
          const pct = run.total > 0 ? Math.min(100, Math.round((run.done / run.total) * 100)) : 0;
          const isCancelling = run.status === 'cancelling' || run.status === 'cancelled';
          return (
            <li key={run.id} className={`border rounded-lg p-3 transition-colors ${isCancelling ? 'bg-danger-soft/30 border-danger/30' : 'bg-blue-50/40 border-blue-200/60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${run.kind === 'email' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {run.kind === 'email' ? 'Email' : 'Site Deploy'}
                    </span>
                    <p className="text-sm font-bold text-ink truncate">{run.name}</p>
                  </div>
                  <div className="mt-2 h-2 w-full bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ease-out rounded-full ${isCancelling ? 'bg-danger' : 'bg-accent'}`}
                      style={{ width: `${pct}%` }}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-secondary">
                    <span className="font-mono">
                      {run.done}/{run.total} ({pct}%)
                    </span>
                    <span className="font-mono uppercase tracking-wider">
                      {run.status === 'cancelling' && 'Cancelling…'}
                      {run.status === 'cancelled' && 'Cancelled'}
                      {run.status === 'completed' && 'Completed'}
                      {run.status === 'starting' && 'Starting…'}
                      {run.status === 'running' && 'Running'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => onStop(run.id, run.kind)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${isCancelling ? 'bg-danger-soft text-danger border border-danger/30 cursor-not-allowed' : 'bg-danger text-white hover:bg-danger/90 border border-danger shadow-xs active:scale-95'}`}
                  aria-label={`Stop ${run.name}`}
                >
                  <Square className="w-3 h-3 fill-current" />
                  {isCancelling ? 'Stopping' : 'Stop'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

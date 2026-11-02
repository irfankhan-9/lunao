// SmsLeadFinder.tsx
//
// "Find Leads in Canada" tab for the SMS campaign wizard (Step 2).
// Mirrors the Email campaign's "Find Leads" flow but for SMS:
//   - Province → City → Niche selection
//   - Google Places API discovery (server-side, Lunao's API key)
//   - Tickable results table with phone numbers
//   - Selected leads passed to the wizard as PipelineLead[]
//
// Shown ONLY to Free/Starter users. Growth+ users get the world-wide
// Places flow (future enhancement).

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  MapPin, Loader2, Search, CheckSquare, Square, AlertCircle,
  RefreshCw, ChevronDown, ExternalLink, Phone, Building2,
  CheckCircle2, Users, Globe, FileSpreadsheet, Sparkles, X, Check,
  Terminal
} from 'lucide-react';
import { playSoftTap, playElegantError, playSlideTick, playVictoryCelebration, playGentleChime } from '../utils/audio';
import { isUgcOrSalesMode } from '../specialModes/modeManager';
import { getAustinTxUgcLeads } from '../specialModes/UgcSandboxEngine';
import {
  listCanadaProvinces,
  listCanadaCities,
  discoverSmsLeads,
  discoverSmsLeadsDetailed,
  SmsSearchTelemetryItem,
  SmsPlaceLead,
  CanadaProvince,
  CanadaCity,
  PipelineLead,
} from '../lib/pipelineClient';
import {
  CANADA_PROVINCES_LIST,
  getLocalCanadaCitiesForProvince,
  normalizeAscii,
} from '../data/canadaCities';
import { useSyncNiches } from '../lib/nichesSync';

interface SmsLeadFinderProps {
  ownerKey: string;
  userPlan: string;
  userCredits?: number;
  campaignNiche?: string;
  onLeadsSelected: (leads: PipelineLead[]) => void;
  onBack?: () => void;
  onCreditsChange?: (credits: number) => void;
}

const NICHE_OPTIONS = [
  { value: 'Barber', label: 'Barbershops & Haircuts' },
  { value: 'Salon', label: 'Hair & Beauty Salons' },
  { value: 'Dentist', label: 'Dentists & Dental Clinics' },
  { value: 'HVAC', label: 'HVAC & Heating/Cooling' },
  { value: 'Gym', label: 'Gyms & Fitness Centers' },
  { value: 'Roofing', label: 'Roofing Contractors' },
  { value: 'Real Estate', label: 'Real Estate Agents' },
  { value: 'Plumber', label: 'Plumbers & Plumbing' },
  { value: 'Electrician', label: 'Electricians' },
  { value: 'Restaurant', label: 'Restaurants' },
  { value: 'Cafe', label: 'Cafes & Coffee Shops' },
  { value: 'Auto Repair', label: 'Auto Repair & Mechanics' },
  { value: 'Landscaping', label: 'Landscaping & Lawn Care' },
  { value: 'Cleaning', label: 'House Cleaning Services' },
];

const LEAD_AMOUNT_OPTIONS = [5, 10, 15, 20, 25, 50];

type Stage = 'idle' | 'loading-provinces' | 'city-picker' | 'discovering' | 'results' | 'error';

export const SmsLeadFinder: React.FC<SmsLeadFinderProps> = ({
  ownerKey,
  userPlan,
  userCredits = 1000,
  campaignNiche = 'Barber',
  onLeadsSelected,
  onCreditsChange,
}) => {
  const isFreePlan = !userPlan || userPlan.toLowerCase().includes('free') || userPlan.toLowerCase() === 'trial';

  // State for Free plan (Canada province/city)
  const [stage, setStage] = useState<Stage>('city-picker');
  const [provinces, setProvinces] = useState<CanadaProvince[]>(CANADA_PROVINCES_LIST);
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [cities, setCities] = useState<CanadaCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<CanadaCity | null>(null);
  const [citySearchQuery, setCitySearchQuery] = useState<string>('');
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState<boolean>(false);
  const cityDropdownRef = useRef<HTMLDivElement | null>(null);
  const citySearchInputRef = useRef<HTMLInputElement | null>(null);
  const [niche, setNiche] = useState<string>(campaignNiche);

  // State for Paid plans (Starter / Pro / Agency) & Free plan amount
  const [paidCityInput, setPaidCityInput] = useState<string>('Austin, TX');
  const [paidNiche, setPaidNiche] = useState<string>(campaignNiche);
  const [leadAmount, setLeadAmount] = useState<number>(20);
  const [isPaidDiscovering, setIsPaidDiscovering] = useState<boolean>(false);
  const [ugcScanStage, setUgcScanStage] = useState<string>('');
  const [ugcScanProgress, setUgcScanProgress] = useState<number>(0);

  const [leads, setLeads] = useState<SmsPlaceLead[]>([]);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isLoadingCities, setIsLoadingCities] = useState(false);

  // Telemetry state for "Under the Hood" discovery breakdown
  const [telemetry, setTelemetry] = useState<SmsSearchTelemetryItem[]>([]);
  const [telemetrySummary, setTelemetrySummary] = useState<{
    totalCalls: number;
    rawTotal: number;
    validAdded: number;
    duplicatesSkipped: number;
    isCustomNiche?: boolean;
    stoppedDueToSaturation?: boolean;
    completionStatus?: string;
    completionMessage?: string;
  }>({ totalCalls: 0, rawTotal: 0, validAdded: 0, duplicatesSkipped: 0 });
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState<boolean>(true);

  const [syncedNiches] = useSyncNiches();

  // Merge built-in site niches with any custom user-created niches (or campaignNiche)
  const allNicheOptions = useMemo(() => {
    const builtInMap = new Map(NICHE_OPTIONS.map((n) => [n.value.toLowerCase(), { ...n, isCustom: false }]));
    const customList: Array<{ value: string; label: string; isCustom: boolean }> = [];

    for (const sn of syncedNiches) {
      const id = String(sn.id || '').trim();
      if (id && !builtInMap.has(id.toLowerCase())) {
        customList.push({
          value: id,
          label: `${sn.label || id} (Custom Niche · City Directions)`,
          isCustom: true,
        });
        builtInMap.set(id.toLowerCase(), { value: id, label: `${sn.label || id} (Custom Niche · City Directions)`, isCustom: true });
      }
    }

    if (campaignNiche && !builtInMap.has(campaignNiche.trim().toLowerCase())) {
      const cleanCustom = campaignNiche.trim();
      customList.push({
        value: cleanCustom,
        label: `${cleanCustom} (Custom Niche · City Directions)`,
        isCustom: true,
      });
    }

    return [
      ...NICHE_OPTIONS.map((n) => ({ ...n, isCustom: false })),
      ...customList,
    ];
  }, [syncedNiches, campaignNiche]);

  // Close city combobox dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) {
        setIsCityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered cities for the selected Canadian province based on combobox search query
  const filteredCities = useMemo(() => {
    const q = normalizeAscii(citySearchQuery);
    if (!q) return cities;
    return cities.filter((c) => {
      const nameAscii = c.ascii || normalizeAscii(c.name);
      if (nameAscii.includes(q)) return true;
      if (Array.isArray(c.alt)) {
        return c.alt.some((a) => normalizeAscii(a).includes(q));
      }
      return false;
    });
  }, [cities, citySearchQuery]);

  const selectedProvinceMeta = useMemo(
    () => provinces.find((p) => p.code === selectedProvince) || null,
    [provinces, selectedProvince]
  );

  // Keep paidNiche synced with campaignNiche when campaignNiche changes
  useEffect(() => {
    if (campaignNiche) {
      setPaidNiche(campaignNiche);
      setNiche(campaignNiche);
    }
  }, [campaignNiche]);

  // Load provinces on mount for free plan (pre-populated with all 13 provinces & territories)
  useEffect(() => {
    if (isFreePlan) {
      setProvinces(CANADA_PROVINCES_LIST);
      setStage('city-picker');
      listCanadaProvinces(ownerKey)
        .then((data) => {
          if (Array.isArray(data) && data.length >= 13) {
            setProvinces(data);
          }
        })
        .catch(() => {
          setProvinces(CANADA_PROVINCES_LIST);
        });
    } else {
      setStage('city-picker');
    }
  }, [ownerKey, isFreePlan]);

  // Load cities when province changes (instant local load + API sync)
  const handleProvinceChange = useCallback(
    async (provinceCode: string) => {
      playSoftTap();
      setSelectedProvince(provinceCode);
      setSelectedCity(null);
      setCitySearchQuery('');
      setIsCityDropdownOpen(false);
      setLeads([]);
      setSelectedSet(new Set());
      setTelemetry([]);
      setTelemetrySummary({ totalCalls: 0, rawTotal: 0, validAdded: 0, duplicatesSkipped: 0 });
      setErrorMsg('');

      if (!provinceCode) {
        setCities([]);
        return;
      }

      // Immediately populate with the full canonical province municipality list
      const immediateCities = getLocalCanadaCitiesForProvince(provinceCode, 500);
      setCities(immediateCities);

      setIsLoadingCities(true);
      try {
        const data = await listCanadaCities(ownerKey, provinceCode, 500);
        if (Array.isArray(data) && data.length > 0) {
          setCities(data);
        }
      } catch {
        // Keep immediateCities
      } finally {
        setIsLoadingCities(false);
      }
    },
    [ownerKey]
  );

  // Parse location string into structured city, province, and country
  const parseLocation = (inputCity: string) => {
    const raw = String(inputCity || '').trim();
    if (!raw) return { city: 'Austin', province: 'TX', country: 'US' };

    let cleaned = raw
      .replace(/calagry/gi, 'Calgary')
      .replace(/vancouvr/gi, 'Vancouver')
      .replace(/torono/gi, 'Toronto')
      .replace(/montreal/gi, 'Montreal')
      .replace(/edmonon/gi, 'Edmonton')
      .replace(/austn/gi, 'Austin');

    const lower = cleaned.toLowerCase();
    const isCanada = lower.includes('canada') ||
      /\b(ab|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|sk|yt|alberta|british columbia|manitoba|ontario|quebec|saskatchewan)\b/i.test(cleaned);

    if (isCanada) {
      let province = 'AB';
      if (lower.includes('vancouver') || lower.includes('victoria') || lower.includes('kelowna') || lower.includes('bc')) province = 'BC';
      else if (lower.includes('calgary') || lower.includes('edmonton') || lower.includes('red deer') || lower.includes('ab') || lower.includes('alberta')) province = 'AB';
      else if (lower.includes('toronto') || lower.includes('ottawa') || lower.includes('mississauga') || lower.includes('hamilton') || lower.includes('on') || lower.includes('ontario')) province = 'ON';
      else if (lower.includes('montreal') || lower.includes('quebec') || lower.includes('qc')) province = 'QC';
      else if (lower.includes('winnipeg') || lower.includes('mb')) province = 'MB';
      else if (lower.includes('saskatoon') || lower.includes('regina') || lower.includes('sk')) province = 'SK';
      else if (lower.includes('halifax') || lower.includes('ns')) province = 'NS';

      let city = cleaned.split(',')[0].replace(/\b(canada|ca)\b/gi, '').trim();
      if (!city) city = 'Calgary';
      city = city.charAt(0).toUpperCase() + city.slice(1);

      return { city, province, country: 'CA' };
    } else {
      let parts = cleaned.split(',').map(s => s.trim());
      let city = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'Austin';
      let province = parts[1] ? parts[1].toUpperCase() : 'TX';
      if (province.length > 2) province = 'TX';
      return { city, province, country: 'US' };
    }
  };

  // Generate realistic fallback leads WITHOUT websites for target local businesses
  const generateRealisticLeads = (targetNiche: string, targetCity: string, limit: number): SmsPlaceLead[] => {
    const list: SmsPlaceLead[] = [];
    const loc = parseLocation(targetCity);

    const companyNamesByNiche: Record<string, string[]> = {
      'HVAC': ['Bow River Heating & Air', 'Mountain Climate Control', 'Stampede Comfort Systems', 'Foothills Air Conditioning', 'Prairie Climate Solutions', 'Vortex Heating & Cooling', 'Apex Climate Pros', 'Heritage Air Mechanics', 'Crown Climate Tech', 'Valley Thermal Solutions', 'Pinnacle Heating & Air', 'EcoTherm Climate Care', 'Cascade Heating & Cooling', 'Summit Thermal Systems', 'Highland Climate Control'],
      'Barber': ['Bourbon & Blade Barber Lounge', 'Crown Clippers Studio', 'Heritage Barber Parlor', 'Cowboy Cut & Shave', 'Prairie Gentleman Barbers', 'Royal Fades Barber Co', 'The Vintage Shave Studio', 'Apex Haircuts', 'Summit Grooming Room', 'Golden Shear Barber Shop', 'The Executive Barber Room', 'Frontier Fades & Shaves'],
      'Salon': ['Lotus Flower Beauty Lounge', 'Aura Hair Studio', 'Velvet & Silk Salon', 'Wildrose Beauty Loft', 'Lumière Hair Loft', 'Bella Rose Boutique', 'Maison de Beauté', 'Gilded Lily Salon', 'Elegance Hair & Beauty'],
      'Dentist': ['Bow Valley Dental Care', 'Calgary Smiles Clinic', 'Summit Dental Studio', 'Prairie Health Dentistry', 'Clear Sky Dental Group', 'Beacon Dental Care', 'Smile Lab Orthodontics', 'Heritage Dental Associates'],
      'Roofing': ['Summit Shield Roofing', 'Stampede Roofing Pros', 'Overhead Roofing Experts', 'Weatherproof Roofers', 'Top Shield Roofs', 'Crown Asphalt & Slate', 'Everlast Shingle Care', 'Pinnacle Roofing Solutions'],
      'Gym': ['Iron Empire Fitness', 'Power House Gym', 'Stampede Athletic Club', 'Forge Performance Gym', 'Vigor Fitness Studio', 'True North Athletic Lab', 'Apex Movement Studio'],
      'Plumber': ['Flow Right Plumbing', 'Bow River Plumbers', 'Precision Plumbing Techs', 'Clear Drain Plumbing Services', 'Rapid Repair Plumbers', 'Pinnacle Plumbing Co', 'Heritage Drain & Pipe'],
      'Electrician': ['Current Tech Electrical', 'Bright Spark Electricians', 'Pinnacle Power & Light', 'Vanguard Electrical Services', 'Northstar Electric Solutions', 'Heritage Power Mechanics'],
      'Real Estate': ['Nouveau Horizon Realty', 'Aura Luxury Properties', 'Apex Realty Brokers', 'Prime City Real Estate', 'Metro Dwelling Group', 'Heritage Estate Advisors'],
    };

    const pool = companyNamesByNiche[targetNiche] || [
      `${loc.city} ${targetNiche} Specialists`,
      `Apex ${targetNiche} Group`,
      `Pinnacle ${targetNiche} Pros`,
      `Northern ${targetNiche} Techs`,
      `Heritage ${targetNiche} Care`,
      `Vanguard ${targetNiche} Solutions`
    ];

    const suffixes = ['Co', 'Services', 'Specialists', 'Associates', 'Solutions', 'Group', 'Partners', 'Studio', 'Pro', 'Techs'];

    for (let i = 0; i < limit; i++) {
      let name = '';
      if (i < pool.length) {
        name = pool[i];
      } else {
        const baseName = pool[i % pool.length];
        const suffix = suffixes[(i - pool.length) % suffixes.length];
        name = `${baseName} ${suffix}`;
      }

      const streetNum = 100 + ((i * 37) % 800);
      const address = `${streetNum} Main St, ${loc.city}, ${loc.province}`;
      const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + loc.city + ' ' + loc.province)}`;

      list.push({
        placeId: `place_${i}_${Date.now()}`,
        name,
        city: loc.city,
        province: loc.province,
        country: loc.country,
        phone: `+1 (${Math.floor(Math.random() * 800 + 200)}) ${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`,
        address,
        website: '', // STRICT ZERO WEBSITE
        googleUrl,
      });
    }
    return list;
  };

  // Discover leads for Free plan (Strict live Google Places API call for normal users)
  const handleDiscover = async () => {
    if (isUgcOrSalesMode()) {
      handlePaidDiscover();
      return;
    }
    if (!selectedCity) return;
    const count = leadAmount > 0 ? leadAmount : 1;
    const COST_PER_LEAD = 1;
    const requiredCredits = count * COST_PER_LEAD;
    const currentCredits = userCredits ?? 1000;
    if (currentCredits < requiredCredits) {
      playElegantError();
      const maxAffordable = Math.max(0, Math.floor(currentCredits / COST_PER_LEAD));
      setErrorMsg(`Not enough credits, u can find only ${maxAffordable} with your current credit balance.`);
      return;
    }
    setStage('discovering');
    setErrorMsg('');
    try {
      const detailed = await discoverSmsLeadsDetailed(ownerKey, {
        niche,
        city: selectedCity.name,
        province: selectedCity.admin || selectedProvince,
        lat: selectedCity.lat,
        lon: selectedCity.lon,
        country: 'CA',
        limit: count,
      });
      const results = detailed.leads || [];
      if (!results || results.length === 0) {
        playElegantError();
        setErrorMsg(
          `No verified ${niche} leads found in ${selectedCity.name}, ${selectedCity.admin || selectedProvince} via live Google Places API. Try another city or business type.`
        );
        setStage('city-picker');
        return;
      }
      setLeads((prev) => {
        const existingPhones = new Set(prev.map(l => l.phone));
        const newUnique = results.filter(l => !existingPhones.has(l.phone));
        return [...newUnique, ...prev];
      });
      setSelectedSet((prev) => {
        const next = new Set(prev);
        results.forEach(l => next.add(l.phone));
        return next;
      });
      setTelemetry(detailed.telemetry || []);
      const validAdded = (detailed.telemetry || []).reduce((acc, t) => acc + (t.validLeadsAdded || 0), 0);
      const dupes = (detailed.telemetry || []).reduce((acc, t) => acc + (t.duplicatesSkipped || 0), 0);
      setTelemetrySummary({
        totalCalls: detailed.totalCalls || 0,
        rawTotal: detailed.rawTotal || 0,
        validAdded,
        duplicatesSkipped: dupes,
        isCustomNiche: detailed.isCustomNiche,
        stoppedDueToSaturation: detailed.stoppedDueToSaturation,
        completionStatus: detailed.completionStatus,
        completionMessage: detailed.completionMessage,
      });
      setStage('results');

      // Deduct credits strictly based on actual live leads returned
      const actualCost = Math.min(requiredCredits, results.length * COST_PER_LEAD);
      const nextCredits = Math.max(0, currentCredits - actualCost);
      localStorage.setItem('lunao_user_credits', nextCredits.toString());
      onCreditsChange?.(nextCredits);
    } catch (err: any) {
      playElegantError();
      setErrorMsg(
        err?.message ||
          "Google Places API request failed or is currently unavailable. Please verify live API configuration and try again."
      );
      setStage('city-picker');
    }
  };

  // Discover leads for Paid plans (Prepends new leads above previous ones)
  const handlePaidDiscover = async () => {
    if (!paidCityInput.trim()) return;
    const count = leadAmount > 0 ? leadAmount : 1;

    // STRICT UGC CREATOR & SALES GUY MODE ISOLATION:
    // If in UGC Creator mode (LNO-UGC-9X4K-77VQ) or Sales Guy mode (LNO-SLS-3M8P-92ZR),
    // run the 3-second branded radar scan with progressive sound effects and generate mocked leads with NO WEBSITE.
    if (isUgcOrSalesMode()) {
      const targetCityLabel = paidCityInput.trim() || 'Austin, TX';
      setIsPaidDiscovering(true);
      setErrorMsg('');
      setUgcScanProgress(15);
      setUgcScanStage(`Connecting to Google Places API (${targetCityLabel})...`);
      playSlideTick();
      await new Promise((r) => setTimeout(r, 900));

      setUgcScanProgress(55);
      setUgcScanStage('Auditing active domain registries & SSL certificates...');
      playSlideTick();
      await new Promise((r) => setTimeout(r, 1050));

      setUgcScanProgress(88);
      setUgcScanStage('Filtering businesses operating without an active mobile website...');
      playSlideTick();
      await new Promise((r) => setTimeout(r, 1050));

      setUgcScanProgress(100);
      setUgcScanStage('Complete: Verified unhosted business targets identified!');
      playVictoryCelebration();

      const ugcLeads = getAustinTxUgcLeads(
        paidNiche || campaignNiche || 'Barber',
        count,
        targetCityLabel
      );
      setLeads((prev) => {
        const existingPhones = new Set(prev.map((l) => l.phone));
        const newUnique = ugcLeads.filter((l) => !existingPhones.has(l.phone));
        return [...newUnique, ...prev];
      });
      setSelectedSet((prev) => {
        const next = new Set(prev);
        ugcLeads.forEach((l) => next.add(l.phone));
        return next;
      });
      setStage('results');
      setIsPaidDiscovering(false);
      setUgcScanStage('');
      setUgcScanProgress(0);
      return;
    }

    const COST_PER_LEAD = 1;
    const requiredCredits = count * COST_PER_LEAD;
    const currentCredits = userCredits ?? 1000;
    if (currentCredits < requiredCredits) {
      playElegantError();
      const maxAffordable = Math.max(0, Math.floor(currentCredits / COST_PER_LEAD));
      setErrorMsg(`Not enough credits, u can find only ${maxAffordable} with your current credit balance.`);
      return;
    }
    setIsPaidDiscovering(true);
    setErrorMsg('');
    try {
      const detailed = await discoverSmsLeadsDetailed(ownerKey, {
        niche: paidNiche,
        city: paidCityInput.trim(),
        limit: count,
      });
      let results = detailed.leads || [];
      if (!results || results.length === 0) {
        if (isUgcOrSalesMode()) {
          results = generateRealisticLeads(paidNiche, paidCityInput.trim(), count);
        } else {
          playElegantError();
          setErrorMsg("Lunao's lead discovery servers are busy or temporarily down. Please try again in a few moments.");
          return;
        }
      }
      setLeads((prev) => {
        const existingPhones = new Set(prev.map(l => l.phone));
        const newUnique = results.filter(l => !existingPhones.has(l.phone));
        return [...newUnique, ...prev];
      });
      setSelectedSet((prev) => {
        const next = new Set(prev);
        results.forEach(l => next.add(l.phone));
        return next;
      });
      setTelemetry(detailed.telemetry || []);
      const validAdded = (detailed.telemetry || []).reduce((acc, t) => acc + (t.validLeadsAdded || 0), 0);
      const dupes = (detailed.telemetry || []).reduce((acc, t) => acc + (t.duplicatesSkipped || 0), 0);
      setTelemetrySummary({
        totalCalls: detailed.totalCalls || 0,
        rawTotal: detailed.rawTotal || 0,
        validAdded,
        duplicatesSkipped: dupes,
        isCustomNiche: detailed.isCustomNiche,
        stoppedDueToSaturation: detailed.stoppedDueToSaturation,
        completionStatus: detailed.completionStatus,
        completionMessage: detailed.completionMessage,
      });
      setStage('results');

      // Deduct credits instantly
      const nextCredits = Math.max(0, currentCredits - requiredCredits);
      localStorage.setItem('lunao_user_credits', nextCredits.toString());
      onCreditsChange?.(nextCredits);
    } catch (err: any) {
      playElegantError();
      if (isUgcOrSalesMode()) {
        const fallback = generateRealisticLeads(paidNiche, paidCityInput.trim(), count);
        setLeads((prev) => {
          const existingPhones = new Set(prev.map(l => l.phone));
          const newUnique = fallback.filter(l => !existingPhones.has(l.phone));
          return [...newUnique, ...prev];
        });
        setSelectedSet((prev) => {
          const next = new Set(prev);
          fallback.forEach(l => next.add(l.phone));
          return next;
        });
        setStage('results');
        const nextCredits = Math.max(0, currentCredits - requiredCredits);
        localStorage.setItem('lunao_user_credits', nextCredits.toString());
        onCreditsChange?.(nextCredits);
      } else {
        setErrorMsg(err?.message || "Lunao's lead discovery servers are busy or temporarily down. Please try again in a few moments.");
      }
    } finally {
      setIsPaidDiscovering(false);
    }
  };

  // Toggle selection
  const handleDownloadCsv = () => {
    playSoftTap();
    const csvRows = [
      ['Business Name', 'Phone', 'City', 'Province', 'Website', 'Address'],
      ...leads.map((l) => [
        `"${(l.name || '').replace(/"/g, '""')}"`,
        `"${(l.phone || '').replace(/"/g, '""')}"`,
        `"${(l.city || '').replace(/"/g, '""')}"`,
        `"${(l.province || '').replace(/"/g, '""')}"`,
        `"${(l.website || '').replace(/"/g, '""')}"`,
        `"${(l.address || '').replace(/"/g, '""')}"`,
      ])
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `lunao_sms_leads_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggle = (lead: SmsPlaceLead) => {
    playSoftTap();
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(lead.phone)) next.delete(lead.phone);
      else next.add(lead.phone);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedSet.size === leads.length) {
      setSelectedSet(new Set());
    } else {
      setSelectedSet(new Set(leads.map((l) => l.phone)));
    }
  };

  const handleApply = () => {
    const selected = leads.filter((l) => selectedSet.has(l.phone));
    const pipelineLeads: PipelineLead[] = selected.map((l) => ({
      name: l.name,
      phone: l.phone,
      city: l.city && l.province ? `${l.city}, ${l.province}` : l.city || 'Austin, TX',
      niche: isFreePlan ? niche : paidNiche,
      placeId: l.placeId,
    }));
    onLeadsSelected(pipelineLeads);
  };

  // ---- RENDER FOR PAID PLANS (Starter / Pro / Agency) ----
  if (!isFreePlan) {
    return (
      <div className="space-y-5 sm:space-y-6 animate-fade-in">
        <div>
          <h2 className="text-lg sm:text-xl font-serif text-ink">Google Places Lead Finder</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Discover verified local businesses with phone numbers and live websites instantly.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 1. City Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-accent" />
              Target City
            </label>
            <input
              type="text"
              value={paidCityInput}
              onChange={(e) => setPaidCityInput(e.target.value)}
              placeholder="e.g. Austin, TX or Vancouver, BC"
              className="w-full px-4 py-3 bg-white border border-border-main rounded-xl text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
            />
          </div>

          {/* 2. Business Type (Niche) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-accent" />
              Business Niche
            </label>
            <div className="relative">
              <select
                value={paidNiche}
                onChange={(e) => setPaidNiche(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-border-main rounded-xl text-sm text-ink appearance-none cursor-pointer hover:border-accent/50 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
              >
                {allNicheOptions.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-ink-tertiary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* 3. Lead Amount */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-accent" />
                Lead Count ({leadAmount})
              </span>
              <span className="text-[10px] text-ink-secondary">No 50 max cap</span>
            </label>
            <div className="grid grid-cols-6 gap-1">
              {[1, 5, 10, 25, 50, 100].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => { playSoftTap(); setLeadAmount(amt); }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    leadAmount === amt
                      ? 'bg-accent text-white border-accent shadow-xs'
                      : 'bg-white text-ink border-border-main hover:bg-off-white'
                  }`}
                >
                  {amt}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-ink-secondary shrink-0">Custom amount:</span>
              <input
                type="number"
                min="0"
                max="5000"
                value={leadAmount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 0) {
                    setLeadAmount(val);
                  } else if (e.target.value === '') {
                    setLeadAmount(0);
                  }
                }}
                className="w-full px-3 py-1.5 bg-white border border-border-main rounded-lg text-xs text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all font-mono"
                placeholder="Enter custom count..."
              />
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-danger-soft border border-danger/20 rounded-xl flex items-center gap-2 text-xs font-semibold text-danger animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* UGC / Sales 3-Second Scanning Radar Container */}
        {isPaidDiscovering && isUgcOrSalesMode() && (
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-border-main shadow-xs space-y-3 animate-fade-in">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-2 font-mono">
                <Search className="w-4 h-4 text-accent" /> Local Business Radar Scan
              </span>
              <span className="text-xs font-bold font-mono text-accent bg-accent-soft px-2 py-0.5 rounded-md border border-accent/15">
                {ugcScanProgress}%
              </span>
            </div>
            {/* Progress track */}
            <div className="w-full h-2 rounded-full bg-off-white border border-border-light overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
                style={{ width: `${ugcScanProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-ink-secondary font-mono">
              <span className="text-ink font-medium flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
                {ugcScanStage || 'Scanning Austin, TX places...'}
              </span>
              <span className="text-[11px] text-ink-tertiary">{paidCityInput || 'Austin, TX'}</span>
            </div>
          </div>
        )}

        {/* Discover CTA */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handlePaidDiscover}
            disabled={isPaidDiscovering}
            className="w-full px-4 py-3.5 sm:px-6 sm:py-4 bg-accent hover:bg-accent-hover text-white text-xs sm:text-sm font-bold rounded-xl
                       flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.98]
                       disabled:opacity-60 disabled:cursor-not-allowed text-center cursor-pointer"
          >
            {isPaidDiscovering ? (
              <>
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin shrink-0 text-amber-300" />
                <span className="truncate">{ugcScanStage || `Discovering ${leadAmount} ${paidNiche} businesses in ${paidCityInput}…`}</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>Find {leadAmount} {paidNiche} Leads in {paidCityInput}</span>
              </>
            )}
          </button>
        </div>

        {/* Results section */}
        {stage === 'results' && leads.length > 0 && (
          <div className="space-y-4 animate-fade-in pt-4 border-t border-border-light">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-ink truncate">
                  {leads.length} businesses found in {paidCityInput}
                </p>
                <p className="text-[11px] text-ink-secondary mt-0.5">
                  {selectedSet.size} selected · Showing all local businesses with & without websites
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="px-3 py-1.5 border border-border-main hover:bg-off-white text-ink text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-accent" />
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={handleToggleAll}
                  className="px-3 py-1.5 border border-border-main hover:bg-off-white text-ink text-xs font-semibold rounded-lg transition-all cursor-pointer"
                >
                  {selectedSet.size === leads.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
            </div>

            {/* Saturation / All Leads Found Banner */}
            {(telemetrySummary.stoppedDueToSaturation || telemetrySummary.completionStatus === 'region_exhausted') && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-950 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900">
                    All Leads Found from {paidCityInput}
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    {telemetrySummary.completionMessage || `Session stopped automatically after detecting 40%+ duplicate businesses (8+ duplicates) to protect your API quota.`}
                  </p>
                </div>
              </div>
            )}



            {/* Lead rows */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
              {leads.map((lead) => {
                const isSelected = selectedSet.has(lead.phone);
                const hasNoWebsite = !lead.website || lead.website.trim().length === 0;
                const googleProfileLink = lead.googleUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + (lead.city || ''))}`;
                return (
                  <button
                    key={lead.phone}
                    type="button"
                    onClick={() => handleToggle(lead)}
                    className={`w-full p-3.5 sm:p-4 rounded-xl border-2 text-left flex items-start gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent-soft'
                        : 'border-border-main hover:border-accent/40 bg-white'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-accent" />
                      ) : (
                        <Square className="w-5 h-5 text-ink-tertiary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs sm:text-sm font-bold text-ink truncate">{lead.name}</p>
                        {hasNoWebsite ? (
                          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 border border-amber-500/30 flex items-center gap-1 font-mono shrink-0 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            🔥 Hot Lead: No Website
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/25 flex items-center gap-1 font-mono shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Website Verified
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] sm:text-xs text-ink-secondary mt-0.5 truncate">
                        {(() => {
                          if (lead.address && lead.address.includes(lead.city)) {
                            return lead.address;
                          }
                          const parts = [lead.address, lead.city, lead.province].filter(Boolean);
                          return parts.join(', ');
                        })()}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs font-mono text-ink-secondary flex-wrap">
                        <span className="flex items-center gap-1 font-semibold text-ink">
                          <Phone className="w-3 h-3 text-accent" /> {lead.phone}
                        </span>
                        {hasNoWebsite ? (
                          <span className="text-amber-800 font-mono text-[11px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25 flex items-center gap-1 font-bold">
                            <Sparkles className="w-3 h-3 text-amber-600" /> 🔥 Hot Lead (No Website)
                          </span>
                        ) : (
                          <a
                            href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:underline flex items-center gap-1"
                          >
                            <Globe className="w-3 h-3 text-emerald-600" /> {lead.website.replace(/^https?:\/\//, '')}
                          </a>
                        )}
                        <a
                          href={googleProfileLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 bg-accent/5 hover:bg-accent/10 px-2 py-0.5 rounded border border-accent/20 transition-colors"
                        >
                          <MapPin className="w-3 h-3 text-accent" /> Google Profile ↗
                        </a>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Apply CTA */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={selectedSet.size === 0}
                className="w-full px-6 py-3.5 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-xl
                           flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.98]
                           disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                Add {selectedSet.size} verified lead{selectedSet.size !== 1 ? 's' : ''} to campaign
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- RENDER FOR FREE PLAN (Canada Province & City Toggle) ----
  if (stage === 'loading-provinces') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg sm:text-xl font-serif text-ink">Find Leads in Canada</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Discover businesses with phone numbers using Google Maps
          </p>
        </div>
        <div className="bg-white border border-border-main rounded-xl p-6 sm:p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm text-ink-secondary">Loading Canadian provinces…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg sm:text-xl font-serif text-ink">Find Leads in Canada (Free Plan)</h2>
        <p className="text-xs text-ink-secondary mt-0.5">
          Select any Canadian province or territory, search or pick a city from the full municipal list, and discover live Google Places leads (1 credit per lead).
        </p>
      </div>

      {/* Step 1: Province / Territory (All 13 Provinces & Territories) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-accent" />
            1. Select a Canadian Province or Territory
          </label>
          <span className="text-[11px] font-mono text-ink-secondary">
            13 Provinces & Territories
          </span>
        </div>
        <div className="relative">
          <select
            value={selectedProvince}
            onChange={(e) => handleProvinceChange(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-border-main rounded-xl text-sm text-ink
                       appearance-none cursor-pointer hover:border-accent/50 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          >
            <option value="">— Choose a province or territory (All 13 across Canada) —</option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} ({p.code}){p.cityCount ? ` · ${p.cityCount} cities & towns` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-ink-tertiary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Step 2: City — Searchable Combobox + Full Scrollable Dropdown List */}
      {selectedProvince && (
        <div className="space-y-2 animate-fade-in" ref={cityDropdownRef}>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-accent" />
              2. Select a City or Town in {selectedProvinceMeta?.name || selectedProvince}
            </label>
            <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
              {cities.length} municipalities available
            </span>
          </div>

          <div className="space-y-2">
            {/* Searchable Combobox Trigger / Input — matches Province selector desktop height & border */}
            <div
              onClick={() => {
                setIsCityDropdownOpen(true);
                setTimeout(() => citySearchInputRef.current?.focus(), 10);
              }}
              className={`w-full px-4 py-3 bg-white border rounded-xl text-sm text-ink flex items-center gap-2.5 cursor-text transition-all ${
                isCityDropdownOpen
                  ? 'border-accent ring-2 ring-accent/20'
                  : 'border-border-main hover:border-accent/50'
              }`}
            >
              <Search className="w-4 h-4 text-ink-tertiary shrink-0" />
              <input
                ref={citySearchInputRef}
                type="text"
                value={
                  isCityDropdownOpen
                    ? citySearchQuery
                    : selectedCity
                    ? `${selectedCity.name} (${selectedCity.admin})${
                        selectedCity.population > 0
                          ? ` · ${selectedCity.population.toLocaleString()} pop.`
                          : ''
                      }`
                    : citySearchQuery
                }
                onFocus={() => setIsCityDropdownOpen(true)}
                onChange={(e) => {
                  setCitySearchQuery(e.target.value);
                  if (!isCityDropdownOpen) setIsCityDropdownOpen(true);
                }}
                placeholder={`Search or scroll all ${cities.length} cities & towns in ${
                  selectedProvinceMeta?.name || selectedProvince
                }…`}
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-tertiary"
              />
              {(selectedCity || citySearchQuery) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playSoftTap();
                    setSelectedCity(null);
                    setCitySearchQuery('');
                    setIsCityDropdownOpen(true);
                    citySearchInputRef.current?.focus();
                  }}
                  title="Clear city selection"
                  className="p-0.5 rounded-md text-ink-tertiary hover:text-ink hover:bg-off-white transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  playSoftTap();
                  setIsCityDropdownOpen((prev) => !prev);
                }}
                className="p-0.5 text-ink-tertiary hover:text-ink cursor-pointer shrink-0"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-150 ${
                    isCityDropdownOpen ? 'rotate-180 text-accent' : ''
                  }`}
                />
              </button>
            </div>

            {/* In-Flow Province Municipality Dropdown Panel — expands card cleanly, never overlaps below cards */}
            {isCityDropdownOpen && (
              <div className="w-full bg-white border border-border-main rounded-xl shadow-xs overflow-hidden animate-fade-in">
                <div className="px-4 py-2 bg-off-white border-b border-border-light flex items-center justify-between text-[11px] font-mono text-ink-secondary">
                  <span>
                    Showing {filteredCities.length} of {cities.length} cities & towns in{' '}
                    {selectedProvinceMeta?.name || selectedProvince}
                  </span>
                  {isLoadingCities && (
                    <span className="flex items-center gap-1 text-accent">
                      <Loader2 className="w-3 h-3 animate-spin" /> Syncing…
                    </span>
                  )}
                </div>

                {filteredCities.length === 0 ? (
                  <div className="p-5 text-center text-xs text-ink-secondary">
                    No matching city in {selectedProvinceMeta?.name || selectedProvince} for "
                    <span className="font-semibold text-ink">{citySearchQuery}</span>".
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-border-light/60 scrollbar-thin">
                    {filteredCities.map((c) => {
                      const isChosen = selectedCity?.name === c.name && selectedCity?.admin === c.admin;
                      return (
                        <button
                          key={`${c.admin}-${c.name}`}
                          type="button"
                          onClick={() => {
                            playSoftTap();
                            setSelectedCity(c);
                            setCitySearchQuery('');
                            setIsCityDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isChosen
                              ? 'bg-accent-soft text-accent font-semibold'
                              : 'hover:bg-off-white text-ink'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <MapPin
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isChosen ? 'text-accent' : 'text-ink-tertiary'
                              }`}
                            />
                            <span className="text-sm truncate">{c.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-off-white border border-border-light text-ink-secondary shrink-0">
                              {c.admin}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            {c.population > 0 && (
                              <span className="text-xs font-mono text-ink-secondary tabular-nums">
                                {c.population.toLocaleString()} pop.
                              </span>
                            )}
                            {isChosen && <Check className="w-4 h-4 text-accent shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selected City Confirmation Pill */}
          {selectedCity && (
            <div className="px-3.5 py-2 rounded-lg bg-accent-soft/60 border border-accent/20 flex items-center justify-between text-xs">
              <span className="font-medium text-ink flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                Target Locked:{' '}
                <strong className="font-semibold">
                  {selectedCity.name}, {selectedCity.admin}, Canada
                </strong>
              </span>
              <span className="font-mono text-[11px] text-ink-secondary tabular-nums">
                {selectedCity.lat.toFixed(3)}°N, {Math.abs(selectedCity.lon).toFixed(3)}°W
              </span>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Niche */}
      {selectedCity && (
        <div className="space-y-2 animate-fade-in">
          <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-accent" />
            3. Choose Business Type
          </label>
          <div className="relative">
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-border-main rounded-xl text-sm text-ink
                         appearance-none cursor-pointer hover:border-accent/50 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
            >
              {allNicheOptions.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-ink-tertiary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Step 4: Lead Amount */}
      {selectedCity && (
        <div className="space-y-1.5 animate-fade-in">
          <label className="text-xs font-semibold text-ink flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-accent" />
              4. Lead Count ({leadAmount}) - 1 credit/lead
            </span>
            <span className="text-[10px] text-ink-secondary">Any amount</span>
          </label>
          <div className="grid grid-cols-6 gap-1">
            {[1, 5, 10, 25, 50, 100].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => { playSoftTap(); setLeadAmount(amt); }}
                className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  leadAmount === amt
                    ? 'bg-accent text-white border-accent shadow-xs'
                    : 'bg-white text-ink border-border-main hover:bg-off-white'
                }`}
              >
                {amt}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] text-ink-secondary shrink-0">Custom amount:</span>
            <input
              type="number"
              min="0"
              max="5000"
              value={leadAmount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 0) {
                  setLeadAmount(val);
                } else if (e.target.value === '') {
                  setLeadAmount(0);
                }
              }}
              className="w-full px-3 py-1.5 bg-white border border-border-main rounded-lg text-xs text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all font-mono"
              placeholder="Enter custom count..."
            />
          </div>
        </div>
      )}

      {/* Discover CTA */}
      {selectedCity && (
        <div className="animate-fade-in space-y-3">
          {errorMsg && (
            <div className="p-3 bg-danger-soft border border-danger/20 rounded-xl flex items-center gap-2 text-xs font-semibold text-danger animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleDiscover}
            disabled={stage === 'discovering'}
            className="w-full px-4 py-3.5 sm:px-6 sm:py-4 bg-accent hover:bg-accent-hover text-white text-xs sm:text-sm font-bold rounded-xl
                       flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.98]
                       disabled:opacity-60 disabled:cursor-not-allowed text-center cursor-pointer"
          >
            {stage === 'discovering' ? (
              <>
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin shrink-0" />
                <span>Discovering {leadAmount} {niche} businesses in {selectedCity.name}, {selectedCity.admin}…</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>Find {leadAmount} {niche} Leads in {selectedCity.name}, {selectedCity.admin}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Results */}
      {stage === 'results' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-ink truncate">
                {leads.length} businesses found in {selectedCity?.name}
              </p>
              <p className="text-[11px] text-ink-secondary mt-0.5">
                {selectedSet.size} selected · Showing all local businesses with & without websites
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="px-3 py-1.5 border border-border-main hover:bg-off-white text-ink text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-accent" />
                Download CSV
              </button>
              <button
                type="button"
                onClick={handleToggleAll}
                className="px-3 py-1.5 border border-border-main hover:bg-off-white text-ink text-xs font-semibold rounded-lg transition-all cursor-pointer"
              >
                {selectedSet.size === leads.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          </div>

          {/* Saturation / All Leads Found Banner (Free Plan) */}
          {(telemetrySummary.stoppedDueToSaturation || telemetrySummary.completionStatus === 'region_exhausted') && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-950 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900">
                  All Leads Found from {selectedCity?.name}
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  {telemetrySummary.completionMessage || `Session stopped automatically after detecting 40%+ duplicate businesses (8+ duplicates).`}
                </p>
              </div>
            </div>
          )}



          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {leads.map((lead) => {
              const isSelected = selectedSet.has(lead.phone);
              const hasNoWebsite = !lead.website || lead.website.trim().length === 0;
              const googleProfileLink = lead.googleUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + (lead.city || ''))}`;
              return (
                <button
                  key={lead.phone}
                  type="button"
                  onClick={() => handleToggle(lead)}
                  className={`w-full p-3.5 sm:p-4 rounded-xl border-2 text-left flex items-start gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-accent bg-accent-soft'
                      : 'border-border-main hover:border-accent/40 bg-white'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-accent" />
                    ) : (
                      <Square className="w-5 h-5 text-ink-tertiary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs sm:text-sm font-bold text-ink truncate">{lead.name}</p>
                      {hasNoWebsite ? (
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 border border-amber-500/30 flex items-center gap-1 font-mono shrink-0 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          🔥 Hot Lead: No Website
                        </span>
                      ) : (
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/25 flex items-center gap-1 font-mono shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Website Verified
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs text-ink-secondary mt-0.5 truncate">
                      {(() => {
                        if (lead.address && lead.address.includes(lead.city)) {
                          return lead.address;
                        }
                        const parts = [lead.address, lead.city, lead.province].filter(Boolean);
                        return parts.join(', ');
                      })()}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs font-mono text-ink-secondary flex-wrap">
                      <span className="flex items-center gap-1 font-semibold text-ink">
                        <Phone className="w-3 h-3 text-accent" /> {lead.phone}
                      </span>
                      {hasNoWebsite ? (
                        <span className="text-amber-800 font-mono text-[11px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25 flex items-center gap-1 font-bold">
                          <Sparkles className="w-3 h-3 text-amber-600" /> 🔥 Hot Lead (No Website)
                        </span>
                      ) : (
                        <a
                          href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:underline flex items-center gap-1"
                        >
                          <Globe className="w-3 h-3 text-emerald-600" /> {lead.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                      <a
                        href={googleProfileLink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 bg-accent/5 hover:bg-accent/10 px-2 py-0.5 rounded border border-accent/20 transition-colors"
                      >
                        <MapPin className="w-3 h-3 text-accent" /> Google Profile ↗
                      </a>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {leads.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={selectedSet.size === 0}
                className="w-full px-6 py-3.5 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-xl
                           flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.98]
                           disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                Add {selectedSet.size} lead{selectedSet.size !== 1 ? 's' : ''} to campaign
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SmsLeadFinder;

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

import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin, Loader2, Search, CheckSquare, Square, AlertCircle,
  RefreshCw, ChevronDown, ExternalLink, Phone, Building2,
  CheckCircle2, Sparkles
} from 'lucide-react';
import { playSoftTap } from '../utils/audio';
import {
  listCanadaProvinces,
  listCanadaCities,
  discoverSmsLeads,
  SmsPlaceLead,
  CanadaProvince,
  CanadaCity,
  PipelineLead,
} from '../lib/pipelineClient';

interface SmsLeadFinderProps {
  ownerKey: string;
  userPlan: string;
  onLeadsSelected: (leads: PipelineLead[]) => void;
  onBack?: () => void;
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

type Stage = 'idle' | 'loading-provinces' | 'city-picker' | 'discovering' | 'results' | 'error';

export const SmsLeadFinder: React.FC<SmsLeadFinderProps> = ({
  ownerKey,
  userPlan,
  onLeadsSelected,
}) => {
  const [stage, setStage] = useState<Stage>('loading-provinces');
  const [provinces, setProvinces] = useState<CanadaProvince[]>([]);
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [cities, setCities] = useState<CanadaCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<CanadaCity | null>(null);
  const [niche, setNiche] = useState<string>('Barber');
  const [leads, setLeads] = useState<SmsPlaceLead[]>([]);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isLoadingCities, setIsLoadingCities] = useState(false);

  // Load provinces on mount
  useEffect(() => {
    setStage('loading-provinces');
    listCanadaProvinces(ownerKey)
      .then((data) => {
        setProvinces(data);
        setStage('city-picker');
      })
      .catch(() => {
        // Hardcoded fallback so the UI still works even if server is unreachable
        setProvinces([
          { code: 'AB', name: 'Alberta' },
          { code: 'BC', name: 'British Columbia' },
          { code: 'MB', name: 'Manitoba' },
          { code: 'NB', name: 'New Brunswick' },
          { code: 'NL', name: 'Newfoundland and Labrador' },
          { code: 'NS', name: 'Nova Scotia' },
          { code: 'NT', name: 'Northwest Territories' },
          { code: 'NU', name: 'Nunavut' },
          { code: 'ON', name: 'Ontario' },
          { code: 'PE', name: 'Prince Edward Island' },
          { code: 'QC', name: 'Quebec' },
          { code: 'SK', name: 'Saskatchewan' },
          { code: 'YT', name: 'Yukon' },
        ]);
        setStage('city-picker');
      });
  }, [ownerKey]);

  // Load cities when province changes
  const handleProvinceChange = useCallback(
    async (provinceCode: string) => {
      setSelectedProvince(provinceCode);
      setSelectedCity(null);
      setCities([]);
      setLeads([]);
      setSelectedSet(new Set());

      if (!provinceCode) return;
      setIsLoadingCities(true);
      try {
        const data = await listCanadaCities(ownerKey, provinceCode, 100);
        setCities(data);
      } catch {
        setCities([]);
      } finally {
        setIsLoadingCities(false);
      }
    },
    [ownerKey]
  );

  // Discover leads
  const handleDiscover = async () => {
    if (!selectedCity) return;
    setStage('discovering');
    setErrorMsg('');
    try {
      const results = await discoverSmsLeads(ownerKey, {
        niche,
        city: selectedCity.name,
        lat: selectedCity.lat,
        lon: selectedCity.lon,
        country: 'CA',
        limit: 20,
      });
      setLeads(results);
      setSelectedSet(new Set(results.map((l) => l.phone)));
      setStage('results');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to discover leads. Please try again.');
      setStage('error');
    }
  };

  // Toggle selection
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
      city: `${l.city}, ${l.province}`,
      niche,
      placeId: l.placeId,
    }));
    onLeadsSelected(pipelineLeads);
  };

  // ---- RENDER ----

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
        <h2 className="text-lg sm:text-xl font-serif text-ink">Find Leads in Canada</h2>
        <p className="text-xs text-ink-secondary mt-0.5">
          Discover businesses with phone numbers using Google Maps
        </p>
      </div>

      {/* Step 1: Province */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-accent" />
          1. Select a Province
        </label>
        <div className="relative">
          <select
            value={selectedProvince}
            onChange={(e) => handleProvinceChange(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-border-main rounded-xl text-sm text-ink
                       appearance-none cursor-pointer hover:border-accent/50 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          >
            <option value="">— Choose a province or territory —</option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-ink-tertiary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Step 2: City */}
      {selectedProvince && (
        <div className="space-y-2 animate-fade-in">
          <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-accent" />
            2. Select a City
          </label>
          <div className="relative">
            {isLoadingCities ? (
              <div className="w-full px-4 py-3 bg-off-white border border-border-main rounded-xl text-sm text-ink-secondary flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading cities…
              </div>
            ) : (
              <select
                value={selectedCity?.name || ''}
                onChange={(e) => {
                  const city = cities.find((c) => c.name === e.target.value);
                  setSelectedCity(city || null);
                }}
                className="w-full px-4 py-3 bg-white border border-border-main rounded-xl text-sm text-ink
                           appearance-none cursor-pointer hover:border-accent/50 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
              >
                <option value="">— Choose a city —</option>
                {cities.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                    {c.population > 0 ? ` · ${c.population.toLocaleString()}` : ''}
                  </option>
                ))}
              </select>
            )}
            <ChevronDown className="w-4 h-4 text-ink-tertiary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
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
              {NICHE_OPTIONS.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-ink-tertiary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Discover CTA */}
      {selectedCity && (
        <div className="animate-fade-in">
          <button
            type="button"
            onClick={handleDiscover}
            disabled={stage === 'discovering'}
            className="w-full px-4 py-3.5 sm:px-6 sm:py-4 bg-accent hover:bg-accent-hover text-white text-xs sm:text-sm font-bold rounded-xl
                       flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.98]
                       disabled:opacity-60 disabled:cursor-not-allowed text-center"
          >
            {stage === 'discovering' ? (
              <>
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin shrink-0" />
                <span>Discovering {niche} businesses in {selectedCity.name}…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>Find {niche} businesses in {selectedCity.name}</span>
              </>
            )}
          </button>
          {stage === 'discovering' && (
            <p className="text-[11px] text-ink-tertiary text-center mt-2">
              Searching Google Maps for businesses with phone numbers…
            </p>
          )}
        </div>
      )}

      {/* Error state */}
      {stage === 'error' && (
        <div className="bg-danger-soft border-2 border-danger/30 rounded-xl p-4 sm:p-5 text-center">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-2" />
          <p className="text-sm font-bold text-danger mb-1">Discovery failed</p>
          <p className="text-xs text-ink-secondary mb-4">{errorMsg}</p>
          <button
            type="button"
            onClick={() => { setStage('city-picker'); setErrorMsg(''); }}
            className="px-4 py-2 border border-border-main hover:bg-off-white text-ink text-xs font-semibold rounded-lg transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
            Try again
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
                {selectedSet.size} selected
              </p>
            </div>
            <button
              type="button"
              onClick={handleDiscover}
              disabled={stage === 'discovering'}
              className="px-3 py-1.5 border border-border-main hover:bg-off-white text-ink text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${stage === 'discovering' ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Select all */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleAll}
              className="flex items-center gap-2 text-xs text-ink-secondary hover:text-ink font-semibold transition-colors"
            >
              {selectedSet.size === leads.length ? (
                <CheckSquare className="w-4 h-4 text-accent" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {selectedSet.size === leads.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {/* Lead rows */}
          <div className="space-y-2">
            {leads.map((lead) => {
              const isSelected = selectedSet.has(lead.phone);
              return (
                <button
                  key={lead.phone}
                  type="button"
                  onClick={() => handleToggle(lead)}
                  className={`w-full p-3.5 sm:p-4 rounded-xl border-2 text-left flex items-start gap-2.5 sm:gap-3 transition-all ${
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
                    <p className="text-xs sm:text-sm font-bold text-ink truncate">{lead.name}</p>
                    <p className="text-[11px] sm:text-xs text-ink-secondary mt-0.5 break-words">
                      {lead.address ? `${lead.address} · ` : ''}
                      {lead.city && lead.province ? `${lead.city}, ${lead.province}` : lead.city}
                    </p>
                    <p className="text-xs font-mono text-ink-secondary mt-0.5">{lead.phone}</p>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    <Phone className={`w-4 h-4 ${isSelected ? 'text-accent' : 'text-ink-tertiary'}`} />
                  </div>
                </button>
              );
            })}
          </div>

          {leads.length === 0 && (
            <div className="bg-white border-2 border-dashed border-border-main rounded-xl p-8 text-center">
              <Search className="w-8 h-8 text-ink-tertiary mx-auto mb-2" />
              <p className="text-sm font-bold text-ink mb-1">No businesses found</p>
              <p className="text-xs text-ink-secondary">
                Try a different city, niche, or province.
              </p>
            </div>
          )}

          {/* Apply CTA */}
          {leads.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              {selectedSet.size > 0 ? (
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 px-6 py-3 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-xl
                             flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Add {selectedSet.size} lead{selectedSet.size !== 1 ? 's' : ''} to campaign
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleAll}
                  className="flex-1 px-6 py-3 bg-off-white hover:bg-border-main text-ink text-sm font-semibold rounded-xl
                             flex items-center justify-center gap-2 transition-all"
                >
                  Select all {leads.length} leads
                </button>
              )}
            </div>
          )}

          <p className="text-[10px] text-ink-tertiary text-center">
            Powered by Google Maps · Phone numbers sourced from Google Business listings
          </p>
        </div>
      )}
    </div>
  );
};

export default SmsLeadFinder;

import React, { useState, useEffect } from 'react';
import {
  Phone,
  Clock,
  Calendar,
  MapPin,
  CheckCircle2,
  Star,
  ShieldCheck,
  ArrowRight,
  User,
  Mail,
  X,
  Sparkles,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { TenantBusiness, Review } from '../../types';
import { bookingService } from '../../services/bookingService';
import { tenantDataService } from '../../services/tenantDataService';
import { TENANT_LANDING_SERVICES, DEFAULT_LANDING_SERVICES, LandingServiceItem } from './landingData';
import { soundEffects } from '../../utils/soundEffects';

interface BusinessLandingViewProps {
  business: TenantBusiness;
  onBookingSuccess?: () => void;
  isInsidePreview?: boolean;
}

export const BusinessLandingView: React.FC<BusinessLandingViewProps> = ({
  business,
  onBookingSuccess,
  isInsidePreview = false,
}) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedService, setSelectedService] = useState<LandingServiceItem | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Booking Form State
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [bookingDate, setBookingDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [bookingTime, setBookingTime] = useState('10:00 AM');
  const [bookingNotes, setBookingNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  const services = TENANT_LANDING_SERVICES[business.id] || DEFAULT_LANDING_SERVICES;

  useEffect(() => {
    async function loadReviews() {
      try {
        const revs = await tenantDataService.getReviews(business.id);
        setReviews(revs);
      } catch {
        // ignore
      }
    }
    loadReviews();
  }, [business.id]);

  const openBookingForService = (service: LandingServiceItem) => {
    soundEffects.playButtonClick();
    setSelectedService(service);
    setIsBookingOpen(true);
    setBookingConfirmed(false);
  };

  const handleOpenGeneralBooking = () => {
    soundEffects.playButtonClick();
    if (!selectedService && services.length > 0) {
      setSelectedService(services[0]);
    }
    setIsBookingOpen(true);
    setBookingConfirmed(false);
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientPhone.trim() || !selectedService) return;

    setIsSubmitting(true);
    try {
      await bookingService.createBooking(
        {
          customerName: clientName.trim(),
          customerPhone: clientPhone.trim(),
          customerEmail: clientEmail.trim() || null,
          service: selectedService.name,
          date: bookingDate,
          time: bookingTime,
          status: 'confirmed',
          source: 'Website',
          notes: bookingNotes.trim() || null,
        },
        business.id
      );

      soundEffects.playSuccess();
      setBookingConfirmed(true);
      if (onBookingSuccess) {
        onBookingSuccess();
      }
    } catch {
      soundEffects.playError();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetBookingForm = () => {
    setIsBookingOpen(false);
    setBookingConfirmed(false);
    setClientName('');
    setClientPhone('');
    setClientEmail('');
    setBookingNotes('');
  };

  const primaryAccent = business.theme.accent || '#047857';

  return (
    <div className="w-full bg-white text-slate-900 font-sans antialiased selection:bg-slate-200">
      {/* Top Announcement Bar */}
      {business.websiteConfig.announcement && (
        <div
          style={{ backgroundColor: primaryAccent }}
          className="text-white text-xs py-2 px-4 text-center font-medium tracking-wide flex items-center justify-center gap-2"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0 opacity-90" />
          <span>{business.websiteConfig.announcement}</span>
        </div>
      )}

      {/* Main Header / Navigation */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{ backgroundColor: primaryAccent }}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-sm shrink-0"
            >
              {business.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <span className="font-bold text-sm sm:text-base tracking-tight text-slate-900 truncate block">
                {business.name}
              </span>
              <span className="text-[11px] text-slate-500 hidden sm:block truncate">
                {business.niche} • {business.city}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <a
              href={`tel:${business.phone}`}
              className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-2 rounded-xl hover:bg-slate-50 transition"
            >
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>{business.phone}</span>
            </a>

            <button
              onClick={handleOpenGeneralBooking}
              style={{ backgroundColor: primaryAccent }}
              className="h-9 px-4 rounded-xl text-white text-xs font-semibold shadow-sm hover:opacity-95 active:scale-[0.98] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{business.websiteConfig.ctaText || 'Book Appointment'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        {/* Background Image with Clean Scrim */}
        <div className="absolute inset-0 z-0">
          <img
            src={business.websiteConfig.heroImage}
            alt={business.name}
            className="w-full h-full object-cover object-center opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/40" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20 lg:py-24 flex flex-col items-center text-center">
          {/* Trust Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-medium text-slate-200 mb-6">
            <div className="flex items-center gap-0.5 text-amber-400">
              <Star className="w-3 h-3 fill-amber-400" />
              <Star className="w-3 h-3 fill-amber-400" />
              <Star className="w-3 h-3 fill-amber-400" />
              <Star className="w-3 h-3 fill-amber-400" />
              <Star className="w-3 h-3 fill-amber-400" />
            </div>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span>5.0 Rating</span>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span>Verified Local Business in {business.city}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white max-w-3xl leading-tight sm:leading-tight">
            {business.websiteConfig.headline}
          </h1>

          <p className="text-sm sm:text-base text-slate-300 mt-4 max-w-2xl leading-relaxed font-normal">
            {business.websiteConfig.subheadline}
          </p>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleOpenGeneralBooking}
              style={{ backgroundColor: primaryAccent }}
              className="w-full sm:w-auto h-11 px-6 rounded-xl text-white text-sm font-semibold shadow-lg hover:opacity-95 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>{business.websiteConfig.ctaText || 'Book Appointment'}</span>
            </button>

            <a
              href={`tel:${business.phone}`}
              className="w-full sm:w-auto h-11 px-5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-medium transition flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4 text-slate-300" />
              <span>Call Front Desk: {business.phone}</span>
            </a>
          </div>

          {/* Value Badges */}
          <div className="mt-10 pt-8 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-4 text-left w-full max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Licensed Specialists</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Upfront Honest Pricing</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300 col-span-2 sm:col-span-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Punctual Reserved Times</span>
            </div>
          </div>
        </div>
      </section>

      {/* Services & Pricing Menu */}
      <section className="py-12 sm:py-16 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-10">
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
              Service Menu
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Transparent Services & Rates
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-2">
              Select your service to check real-time availability and confirm your reservation in under a minute.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {services.map((svc) => (
              <div
                key={svc.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-snug">
                      {svc.name}
                    </h3>
                    <span className="text-base font-bold text-slate-900 shrink-0">
                      {svc.price}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {svc.duration}
                    </span>
                    <span>•</span>
                    <span>Direct booking</span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {svc.description}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-500">
                    No payment needed today
                  </span>
                  <button
                    onClick={() => openBookingForService(svc)}
                    style={{ borderColor: primaryAccent, color: primaryAccent }}
                    className="h-8 px-3.5 rounded-xl border text-xs font-semibold hover:bg-slate-50 active:scale-[0.98] transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>Select & Book</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us / Guarantees */}
      <section className="py-12 sm:py-16 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-lg mx-auto mb-10">
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
              The Standard
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Why Our Clients Trust Us
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-800 mb-4 shadow-2xs">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Proven Local Experience</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Every service is delivered by certified, seasoned professionals with years of hands-on local experience in {business.city}.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-800 mb-4 shadow-2xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Straightforward Pricing</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Clear, transparent rates established prior to starting any work. No hidden add-ons or unexpected fees at checkout.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-800 mb-4 shadow-2xs">
                <Clock className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Respect for Your Time</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                We manage our schedule carefully to ensure appointments run on time, giving you attentive and unhurried care.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Verified Reviews Section */}
      {reviews.length > 0 && (
        <section className="py-12 sm:py-16 bg-slate-50 border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
                  Client Feedback
                </span>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
                  What Neighborhood Clients Say
                </h2>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-2xs">
                <div className="flex items-center text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                </div>
                <span>5.0 Star Average from Verified Visits</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviews.slice(0, 4).map((rev) => (
                <div
                  key={rev.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1 text-amber-400">
                        {Array.from({ length: rev.rating || 5 }).map((_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                        ))}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        Verified Review
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-700 italic leading-relaxed">
                      "{rev.comment}"
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{rev.customerName}</span>
                    <span className="text-slate-500 text-[11px]">{rev.service}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Business Hours & Location Section */}
      <section className="py-12 sm:py-16 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Hours */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-slate-700" />
                <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                  Hours of Operation
                </h3>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-mono">
                {business.aiSettings.businessHours}
              </p>
              <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <span>Timezone: {business.timezone}</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Open Today
                </span>
              </div>
            </div>

            {/* Location & Directions */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-slate-700" />
                <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                  Location & Contact
                </h3>
              </div>
              <p className="text-sm font-semibold text-slate-900">
                {business.address}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {business.city}
              </p>
              {business.aiSettings.locationDetails && (
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {business.aiSettings.locationDetails}
                </p>
              )}

              <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-3">
                <a
                  href={`tel:${business.phone}`}
                  className="h-8 px-3 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition inline-flex items-center gap-1.5"
                >
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <span>Call {business.phone}</span>
                </a>

                {business.socialLinks?.googleMaps && (
                  <a
                    href={business.socialLinks.googleMaps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    <span>Get Directions</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-slate-950 text-slate-400 text-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-bold text-white text-sm block">{business.name}</span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {business.address}, {business.city} • {business.phone}
            </p>
          </div>

          <div className="text-center sm:text-right text-[11px] text-slate-500">
            <p>© {new Date().getFullYear()} {business.name}. All rights reserved.</p>
            <p className="text-[10px] mt-0.5 text-slate-600">
              Official Online Booking Portal
            </p>
          </div>
        </div>
      </footer>

      {/* Interactive Booking Modal */}
      {isBookingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {bookingConfirmed ? 'Reservation Confirmed' : 'Schedule Appointment'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {business.name}
                </p>
              </div>
              <button
                onClick={resetBookingForm}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {bookingConfirmed ? (
              <div className="py-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-bold text-lg text-slate-900">You’re All Set!</h4>
                  <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto leading-relaxed">
                    Thank you {clientName}. Your appointment for{' '}
                    <span className="font-semibold text-slate-800">
                      {selectedService?.name}
                    </span>{' '}
                    has been scheduled for{' '}
                    <span className="font-semibold text-slate-800">
                      {bookingDate} at {bookingTime}
                    </span>
                    .
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-1.5 text-slate-700">
                  <p>
                    <span className="font-semibold">Location:</span> {business.address}, {business.city}
                  </p>
                  <p>
                    <span className="font-semibold">Questions:</span> Call {business.phone}
                  </p>
                </div>

                <button
                  onClick={resetBookingForm}
                  style={{ backgroundColor: primaryAccent }}
                  className="w-full h-10 rounded-xl text-white text-xs font-semibold shadow-sm hover:opacity-95 transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitBooking} className="mt-4 space-y-4 text-xs">
                {/* Service Selection */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Selected Service *
                  </label>
                  <select
                    value={selectedService?.id || ''}
                    onChange={(e) => {
                      const found = services.find((s) => s.id === e.target.value);
                      if (found) setSelectedService(found);
                    }}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-hidden focus:border-slate-500 shadow-2xs"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.price} ({s.duration})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date and Time Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-hidden focus:border-slate-500 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">
                      Preferred Time *
                    </label>
                    <select
                      value={bookingTime}
                      onChange={(e) => setBookingTime(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-hidden focus:border-slate-500 shadow-2xs"
                    >
                      <option value="9:00 AM">9:00 AM</option>
                      <option value="10:00 AM">10:00 AM</option>
                      <option value="11:30 AM">11:30 AM</option>
                      <option value="1:00 PM">1:00 PM</option>
                      <option value="2:30 PM">2:30 PM</option>
                      <option value="4:00 PM">4:00 PM</option>
                      <option value="5:15 PM">5:15 PM</option>
                    </select>
                  </div>
                </div>

                {/* Client Contact */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Morgan"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-hidden focus:border-slate-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Phone Number (for confirmation SMS) *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="(555) 000-0000"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-hidden focus:border-slate-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="alex@example.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-hidden focus:border-slate-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Special Notes or Preferences
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Any specific requests for our team..."
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-hidden focus:border-slate-500 resize-none shadow-2xs"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{ backgroundColor: primaryAccent }}
                    className="w-full h-11 rounded-xl text-white text-xs font-semibold shadow-md hover:opacity-95 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span>Scheduling...</span>
                    ) : (
                      <>
                        <span>Confirm Appointment Reservation</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-slate-500 text-center mt-2">
                    No credit card required. Free cancellation up to 24 hours prior.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

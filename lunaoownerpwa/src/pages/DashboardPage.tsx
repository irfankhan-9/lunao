import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Users,
  Clock,
  ExternalLink,
  Mail,
  Bot,
  ArrowRight,
  ShieldCheck,
  CalendarDays,
  Plus,
  Phone,
  Workflow,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Booking, ActivityEvent } from '../types';
import { bookingService } from '../services/bookingService';
import { customerService } from '../services/customerService';
import { tenantDataService } from '../services/tenantDataService';
import { soundEffects } from '../utils/soundEffects';

export const DashboardPage: React.FC = () => {
  const { business, setActiveSection, showToast } = useBusiness();
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setIsLoading(true);
        const [allBookings, allCustomers, allActs] = await Promise.all([
          bookingService.getBookings(business.id),
          customerService.getCustomers(business.id),
          tenantDataService.getActivities(business.id),
        ]);

        if (isMounted) {
          const today = allBookings.filter((b) => b.date === '2026-09-06');
          setTodayBookings(today);

          const upcoming = allBookings.filter(
            (b) => b.date > '2026-09-06' && b.status !== 'cancelled'
          );
          setUpcomingCount(upcoming.length);
          setCustomerCount(allCustomers.length);
          setActivities(allActs);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [business.id]);

  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? 'Good morning'
      : currentHour < 18
      ? 'Good afternoon'
      : 'Good evening';

  return (
    <div className="space-y-6">
      {/* Above-the-fold Greeting & Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              {greeting}, {business.name.split(' ')[0]}
            </h2>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            <span className="font-semibold text-slate-700">{business.name}</span> • {business.niche} • {business.city}
          </p>
        </div>

        {/* Quick External Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={business.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => soundEffects.playButtonClick()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white border border-slate-200 hover:border-emerald-300 text-xs font-medium text-slate-700 hover:text-emerald-800 shadow-xs transition"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            <span>Open Website</span>
          </a>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              soundEffects.playButtonClick();
              setActiveSection('bookings');
            }}
          >
            New Booking
          </Button>
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <StatCard
          label="Today's Bookings"
          value={isLoading ? '-' : todayBookings.length}
          subtext={
            todayBookings.length > 0
              ? `${todayBookings.filter((b) => b.status === 'confirmed').length} confirmed appointments`
              : 'No appointments scheduled today'
          }
          icon={<Calendar className="w-5 h-5" />}
          onClick={() => {
            soundEffects.playButtonClick();
            setActiveSection('bookings');
          }}
        />
        <StatCard
          label="Upcoming Bookings"
          value={isLoading ? '-' : upcomingCount}
          subtext="Confirmed bookings this week"
          icon={<Clock className="w-5 h-5" />}
          onClick={() => {
            soundEffects.playButtonClick();
            setActiveSection('bookings');
          }}
        />
        <StatCard
          label="Total Clients"
          value={isLoading ? '-' : customerCount}
          subtext="Verified client profiles in directory"
          icon={<Users className="w-5 h-5" />}
          onClick={() => {
            soundEffects.playButtonClick();
            setActiveSection('customers');
          }}
        />
      </div>

      {/* Quick Action Tiles */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Daily Operations for {business.name}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => {
              soundEffects.playButtonClick();
              setActiveSection('bookings');
            }}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-left transition group active:scale-[0.98]"
          >
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 group-hover:text-emerald-800 truncate">
                Schedule
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                View appointments
              </p>
            </div>
          </button>

          <button
            onClick={() => {
              soundEffects.playButtonClick();
              setActiveSection('email');
            }}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-left transition group active:scale-[0.98]"
          >
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 group-hover:text-emerald-800 truncate">
                Email Center
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                Message clients
              </p>
            </div>
          </button>

          <button
            onClick={() => {
              soundEffects.playButtonClick();
              setActiveSection('ai_receptionist');
            }}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-left transition group active:scale-[0.98]"
          >
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 group-hover:text-emerald-800 truncate">
                Front Desk
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                Hours & guidelines
              </p>
            </div>
          </button>

          <button
            onClick={() => {
              soundEffects.playButtonClick();
              setActiveSection('automations');
            }}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-left transition group active:scale-[0.98]"
          >
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
              <Workflow className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 group-hover:text-emerald-800 truncate">
                Automations
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                Reminders & triggers
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Two-Column Grid: Today's Bookings & Recent Real Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Today's Schedule */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Today's Appointments
              </h3>
              <p className="text-xs text-slate-500">
                Scheduled for Sunday, Sep 06, 2026
              </p>
            </div>
            <button
              onClick={() => setActiveSection('bookings')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline inline-flex items-center gap-1"
            >
              <span>All Appointments</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {todayBookings.length === 0 ? (
            <EmptyState
              icon={<Calendar className="w-6 h-6" />}
              title="No bookings today"
              description="When clients reserve appointments through your website or front desk, they will display here."
              actionLabel="Add Appointment"
              onAction={() => setActiveSection('bookings')}
            />
          ) : (
            <div className="space-y-2.5">
              {todayBookings.map((b) => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBooking(b)}
                  className="p-3.5 md:p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-xs cursor-pointer transition flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold leading-none">
                        TIME
                      </span>
                      <span className="text-xs font-bold text-slate-900 mt-0.5 leading-none">
                        {b.time.replace(':00', '')}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-emerald-800">
                          {b.customerName}
                        </p>
                        {b.source && (
                          <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                            {b.source}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {b.service || 'Scheduled Service'}
                        {b.notes && ` • ${b.notes}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        b.status === 'confirmed'
                          ? 'success'
                          : b.status === 'completed'
                          ? 'accent'
                          : 'neutral'
                      }
                      dot
                    >
                      {b.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Col: Real Event Activity */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Recent Activity
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Audit Trail
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3.5">
            {activities.length === 0 ? (
              <p className="text-xs text-slate-500">No recent activity recorded.</p>
            ) : (
              activities.slice(0, 4).map((act) => (
                <div key={act.id} className="flex items-start gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">{act.title}</p>
                    {act.description && (
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {act.description}
                      </p>
                    )}
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {act.timestamp}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Virtual Front Desk Status Card */}
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-semibold text-emerald-900">
                Front Desk Ready
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Handling customer inquiries, answering verified hours, and queuing appointments 24/7.
            </p>
            <button
              onClick={() => setActiveSection('ai_receptionist')}
              className="mt-3 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              Review Desk Instructions &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Booking Details BottomSheet */}
      {selectedBooking && (
        <BottomSheet
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          title="Appointment Details"
          subtitle={`Reference Number: ${selectedBooking.id}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedBooking.customerName}
                </p>
                <p className="text-slate-600 mt-0.5">{selectedBooking.customerPhone}</p>
                {selectedBooking.customerEmail && (
                  <p className="text-slate-600">{selectedBooking.customerEmail}</p>
                )}
              </div>
              <Badge
                variant={
                  selectedBooking.status === 'confirmed'
                    ? 'success'
                    : selectedBooking.status === 'completed'
                    ? 'accent'
                    : 'neutral'
                }
                dot
              >
                {selectedBooking.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 font-medium">Service</span>
                <p className="text-slate-900 font-semibold mt-0.5">
                  {selectedBooking.service || 'Standard Service'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 font-medium">Date & Time</span>
                <p className="text-slate-900 font-semibold mt-0.5">
                  {selectedBooking.date} at {selectedBooking.time}
                </p>
              </div>
            </div>

            {selectedBooking.source && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 font-medium">Booking Channel</span>
                <p className="text-slate-900 font-semibold mt-0.5">
                  {selectedBooking.source}
                </p>
              </div>
            )}

            {selectedBooking.notes && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 font-medium">Client Notes</span>
                <p className="text-slate-700 mt-1 leading-relaxed">
                  {selectedBooking.notes}
                </p>
              </div>
            )}

            <div className="pt-2 flex items-center gap-2">
              {selectedBooking.customerPhone && selectedBooking.customerPhone.trim() !== '' && (
                <a
                  href={`tel:${selectedBooking.customerPhone.replace(/[^0-9]/g, '')}`}
                  onClick={() => soundEffects.playButtonClick()}
                  className="flex-1 h-10 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2 font-medium transition shadow-xs"
                >
                  <Phone className="w-4 h-4 text-emerald-700" />
                  <span>Call Client</span>
                </a>
              )}
              {selectedBooking.status !== 'confirmed' && selectedBooking.status !== 'completed' && selectedBooking.status !== 'cancelled' && (
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={async () => {
                    soundEffects.playSuccess();
                    await bookingService.updateBookingStatus(selectedBooking.id, 'confirmed', business.id);
                    setTodayBookings((prev) =>
                      prev.map((b) =>
                        b.id === selectedBooking.id ? { ...b, status: 'confirmed' } : b
                      )
                    );
                    setSelectedBooking(null);
                    showToast('Appointment confirmed');
                  }}
                >
                  Confirm Booking
                </Button>
              )}
              {selectedBooking.status === 'confirmed' && (
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={async () => {
                    soundEffects.playSuccess();
                    await bookingService.updateBookingStatus(selectedBooking.id, 'completed', business.id);
                    setTodayBookings((prev) =>
                      prev.map((b) =>
                        b.id === selectedBooking.id ? { ...b, status: 'completed' } : b
                      )
                    );
                    setSelectedBooking(null);
                    showToast('Appointment marked as completed');
                  }}
                >
                  Mark Completed
                </Button>
              )}
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};

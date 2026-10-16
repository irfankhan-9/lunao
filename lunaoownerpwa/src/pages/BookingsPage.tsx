import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Plus,
  Phone,
  Mail,
  Search,
  AlertCircle,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { Booking, BookingStatus } from '../types';
import { bookingService } from '../services/bookingService';
import { emailService } from '../services/emailService';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { BottomSheet } from '../components/ui/BottomSheet';
import { soundEffects } from '../utils/soundEffects';

export const BookingsPage: React.FC = () => {
  const { business, showToast } = useBusiness();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeView, setActiveView] = useState<'list' | 'calendar'>('list');
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [cancelConfirmMode, setCancelConfirmMode] = useState<'silent' | 'with_email' | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  // New Booking Form State
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newService, setNewService] = useState('');
  const [newDate, setNewDate] = useState('2026-09-07');
  const [newTime, setNewTime] = useState('11:30 AM');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const data = await bookingService.getBookings();
        if (isMounted) {
          setBookings(data);
          setSyncError(null);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setSyncError(err?.message || 'Unable to connect to live bookings database');
          setIsLoading(false);
        }
      }
    }
    load();

    // Live background polling for real-time bookings synchronization
    const interval = setInterval(async () => {
      if (!isMounted) return;
      try {
        const data = await bookingService.getBookings();
        if (isMounted) {
          setBookings(data);
          setSyncError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setSyncError(err?.message || 'Live database sync interrupted');
        }
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [business.id]);

  // Filtering
  const filteredBookings = bookings.filter((b) => {
    const matchesStatus =
      statusFilter === 'all' ? true : b.status === statusFilter;
    const matchesSearch =
      b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.customerPhone.includes(searchQuery) ||
      (b.service && b.service.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  const handleStatusChange = async (id: string, newStatus: BookingStatus) => {
    try {
      const updated = await bookingService.updateBookingStatus(id, newStatus);
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
      if (selectedBooking && selectedBooking.id === id) {
        setSelectedBooking(updated);
      }
      showToast(`Appointment marked as ${newStatus}`);
    } catch {
      showToast('Error updating status');
    }
  };

  const handleCancelAndSendEmail = async (b: Booking) => {
    try {
      soundEffects.playButtonClick();
      const updated = await bookingService.updateBookingStatus(b.id, 'cancelled');
      setBookings((prev) => prev.map((item) => (item.id === b.id ? updated : item)));
      if (selectedBooking && selectedBooking.id === b.id) {
        setSelectedBooking(updated);
      }
      if (b.customerEmail) {
        await emailService.sendEmail({
          recipientNames: [b.customerName],
          recipientEmails: [b.customerEmail],
          subject: `Appointment Cancelled: ${b.service || 'Appointment'} on ${b.date}`,
          body: `Hi ${b.customerName},\n\nYour appointment for ${b.service || 'Appointment'} scheduled on ${b.date} at ${b.time} with ${business.name} has been cancelled as requested.\n\nIf you wish to reschedule, please visit ${business.websiteUrl} or call ${business.phone}.\n\nWarm regards,\n${business.name}`,
          templateName: 'Appointment Cancellation Notice',
        });
      }
      soundEffects.playSuccess();
      showToast(`Booking cancelled & cancellation email sent to ${b.customerName}!`);
    } catch {
      showToast('Error processing cancellation and email');
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newPhone.trim()) {
      showToast('Please provide client name and phone number');
      return;
    }

    try {
      const created = await bookingService.createBooking({
        customerName: newCustomerName.trim(),
        customerPhone: newPhone.trim(),
        customerEmail: newEmail.trim() || null,
        service: newService.trim() || null,
        date: newDate,
        time: newTime,
        status: 'confirmed',
        source: 'Direct',
        notes: newNotes.trim() || null,
      });

      setBookings((prev) => [created, ...prev]);
      setIsCreateOpen(false);
      setNewCustomerName('');
      setNewPhone('');
      setNewEmail('');
      setNewService('');
      setNewNotes('');
      showToast('New appointment scheduled');
    } catch {
      showToast('Failed to add booking');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            Appointments & Bookings
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Client reservations and front desk calendar
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs">
            <button
              onClick={() => {
                soundEffects.playTabSwitch();
                setActiveView('list');
              }}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                activeView === 'list'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              List View
            </button>
            <button
              onClick={() => {
                soundEffects.playTabSwitch();
                setActiveView('calendar');
              }}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                activeView === 'calendar'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Calendar View
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsCreateOpen(true)}
          >
            New Appointment
          </Button>
        </div>
      </div>

      {/* Live Sync Warning Banner */}
      {syncError && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-700 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span className="truncate">
              <strong>Database Sync Notice:</strong> {syncError}
            </span>
          </div>
          <button
            onClick={() => {
              setIsLoading(true);
              bookingService.getBookings()
                .then((d) => { setBookings(d); setSyncError(null); })
                .catch((e) => setSyncError(e.message))
                .finally(() => setIsLoading(false));
            }}
            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 rounded-lg text-xs font-semibold shrink-0 transition"
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* Filter Chips & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client name, phone, or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-4 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['all', 'confirmed', 'completed', 'cancelled'] as const).map((st) => (
            <button
              key={st}
              onClick={() => {
                soundEffects.playTabSwitch();
                setStatusFilter(st);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize whitespace-nowrap transition border ${
                statusFilter === st
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {st === 'all' ? 'All Bookings' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Main View: List or Calendar */}
      {activeView === 'list' ? (
        filteredBookings.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="w-6 h-6" />}
            title="No bookings match criteria"
            description="Try switching the filter or scheduling a new client appointment."
            actionLabel="Add Appointment"
            onAction={() => setIsCreateOpen(true)}
          />
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((b) => (
              <div
                key={b.id}
                onClick={() => {
                  setSelectedBooking(b);
                  setCancelConfirmMode(null);
                }}
                className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-xs cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold leading-none">
                      {b.date.slice(5)}
                    </span>
                    <span className="text-xs font-bold text-slate-900 mt-1 leading-none">
                      {b.time.replace(':00', '')}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 group-hover:text-emerald-800">
                        {b.customerName}
                      </span>
                      {b.source && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          {b.source}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {b.service || 'Appointment'} • {b.customerPhone}
                    </p>
                    {b.notes && (
                      <p className="text-[11px] text-slate-500 mt-0.5 italic truncate">
                        "{b.notes}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
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
        )
      ) : (
        /* Calendar View Matrix */
        <div className="p-4 md:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                September 2026 Master Schedule
              </h3>
              <p className="text-xs text-slate-500">
                Interactive calendar view across upcoming days
              </p>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09'].map((day) => {
                const count = bookings.filter((b) => b.date === day).length;
                const isSelected = day === '2026-09-06' || day === '2026-09-07';
                return (
                  <span
                    key={day}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium whitespace-nowrap flex items-center gap-1 border border-slate-200"
                  >
                    <span>{day.split('-').slice(1).join('/')}</span>
                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center">
                      {count}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['2026-09-06', '2026-09-07', '2026-09-08'].map((day) => {
              const dayBookings = bookings.filter((b) => b.date === day);
              const dayLabel =
                day === '2026-09-06'
                  ? 'Today (Sep 06)'
                  : day === '2026-09-07'
                  ? 'Tomorrow (Sep 07)'
                  : 'Tuesday (Sep 08)';
              return (
                <div
                  key={day}
                  className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3 shadow-2xs"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-600" />
                      <span className="text-xs font-bold text-slate-900">
                        {dayLabel}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {dayBookings.length} {dayBookings.length === 1 ? 'appt' : 'appts'}
                    </span>
                  </div>

                  {dayBookings.length === 0 ? (
                    <div className="py-8 text-center space-y-1">
                      <p className="text-xs text-slate-400">No appointments scheduled</p>
                      <p className="text-[10px] text-slate-400">Schedule is clear for this day</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dayBookings.map((b) => (
                        <div
                          key={b.id}
                          onClick={() => {
                            soundEffects.playButtonClick();
                            setSelectedBooking(b);
                            setCancelConfirmMode(null);
                          }}
                          className="p-3 rounded-xl bg-white hover:border-emerald-400 cursor-pointer border border-slate-200 text-xs transition shadow-2xs space-y-1.5 group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 group-hover:text-emerald-700 transition truncate">
                              {b.customerName}
                            </span>
                            <span className="text-[11px] text-emerald-700 font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-50">
                              {b.time}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="truncate">{b.service || 'Service'}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 font-mono text-slate-600">
                              {b.source}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking Detail BottomSheet */}
      {selectedBooking && (
        <BottomSheet
          isOpen={!!selectedBooking}
          onClose={() => {
            setSelectedBooking(null);
            setCancelConfirmMode(null);
          }}
          title="Appointment Record"
          subtitle={`Reference ID: ${selectedBooking.id}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedBooking.customerName}
                </p>
                <p className="text-slate-600 mt-0.5">{selectedBooking.customerPhone}</p>
                {selectedBooking.customerEmail ? (
                  <p className="text-slate-600">{selectedBooking.customerEmail}</p>
                ) : (
                  <p className="text-slate-400 italic">No email on file</p>
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

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Service</span>
                <p className="text-slate-900 font-semibold mt-0.5">
                  {selectedBooking.service || 'Standard Service'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Scheduled Time</span>
                <p className="text-slate-900 font-semibold mt-0.5">
                  {selectedBooking.date} at {selectedBooking.time}
                </p>
              </div>
            </div>

            {selectedBooking.source && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Booking Origin</span>
                <p className="text-slate-900 font-semibold mt-0.5">
                  {selectedBooking.source}
                </p>
              </div>
            )}

            {selectedBooking.notes && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Client Instructions</span>
                <p className="text-slate-700 mt-1 leading-relaxed">
                  {selectedBooking.notes}
                </p>
              </div>
            )}

            {/* Direct Communication Actions */}
            <div className="flex items-center gap-2 pt-2">
              {selectedBooking.customerPhone && selectedBooking.customerPhone.trim() !== '' && (
                <a
                  href={`tel:${selectedBooking.customerPhone.replace(/[^0-9]/g, '')}`}
                  className="flex-1 h-10 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2 font-medium transition shadow-2xs"
                >
                  <Phone className="w-4 h-4 text-emerald-700" />
                  <span>Call Client</span>
                </a>
              )}

              {selectedBooking.customerEmail && (
                <a
                  href={`mailto:${selectedBooking.customerEmail}`}
                  className="flex-1 h-10 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2 font-medium transition shadow-2xs"
                >
                  <Mail className="w-4 h-4 text-emerald-700" />
                  <span>Send Email</span>
                </a>
              )}
            </div>

            {/* Booking State Actions */}
            <div className="flex flex-col gap-2 pt-1 border-t border-slate-200">
              {selectedBooking.status !== 'confirmed' && selectedBooking.status !== 'completed' && selectedBooking.status !== 'cancelled' && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    soundEffects.playSuccess();
                    handleStatusChange(selectedBooking.id, 'confirmed');
                  }}
                >
                  Confirm Appointment
                </Button>
              )}
              {selectedBooking.status === 'confirmed' && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    soundEffects.playSuccess();
                    handleStatusChange(selectedBooking.id, 'completed');
                  }}
                >
                  Mark Completed
                </Button>
              )}

              {selectedBooking.status !== 'cancelled' && (
                <>
                  {/* Warning Confirmation for Silent Cancellation (No Email) */}
                  {cancelConfirmMode === 'silent' && (
                    <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-amber-950">
                            Customer will not be notified
                          </p>
                          <p className="text-[11px] text-amber-900 leading-relaxed">
                            {selectedBooking.customerName} will <strong>not</strong> receive an automated email or notification alerting them that their appointment was cancelled. Are you sure you want to cancel this booking?
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-0.5">
                        <Button
                          variant="outline"
                          className="flex-1 text-xs bg-white"
                          onClick={() => {
                            soundEffects.playButtonClick();
                            setCancelConfirmMode(null);
                          }}
                        >
                          Keep Booking
                        </Button>
                        <Button
                          variant="primary"
                          className="flex-1 text-xs bg-amber-700 hover:bg-amber-800 text-white"
                          onClick={() => {
                            soundEffects.playButtonClick();
                            setCancelConfirmMode(null);
                            handleStatusChange(selectedBooking.id, 'cancelled');
                            setSelectedBooking(null);
                          }}
                        >
                          Yes, Cancel Without Email
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Confirmation for Cancel & Send Email */}
                  {cancelConfirmMode === 'with_email' && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <Mail className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-rose-950">
                            Cancel & Send Email Notification
                          </p>
                          <p className="text-[11px] text-rose-900 leading-relaxed">
                            A cancellation notification email will be sent immediately to {selectedBooking.customerName}
                            {selectedBooking.customerEmail ? ` (${selectedBooking.customerEmail})` : ''}. Are you sure you want to cancel and notify?
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-0.5">
                        <Button
                          variant="outline"
                          className="flex-1 text-xs bg-white"
                          onClick={() => {
                            soundEffects.playButtonClick();
                            setCancelConfirmMode(null);
                          }}
                        >
                          Keep Booking
                        </Button>
                        <Button
                          variant="primary"
                          className="flex-1 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                          onClick={async () => {
                            setCancelConfirmMode(null);
                            await handleCancelAndSendEmail(selectedBooking);
                            setSelectedBooking(null);
                          }}
                        >
                          Yes, Cancel & Email
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Default State: Both Cancel Actions Available */}
                  {cancelConfirmMode === null && (
                    <div className="flex items-center gap-2 w-full">
                      <Button
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => {
                          soundEffects.playButtonClick();
                          setCancelConfirmMode('silent');
                        }}
                      >
                        Cancel Booking
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                        onClick={() => {
                          soundEffects.playButtonClick();
                          setCancelConfirmMode('with_email');
                        }}
                      >
                        Cancel & Send Email
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Add New Booking Modal / BottomSheet */}
      {isCreateOpen && (
        <BottomSheet
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="New Client Appointment"
          subtitle="Record an in-person, phone, or direct reservation"
        >
          <form onSubmit={handleCreateBooking} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Client Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Jordan Miller"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1 font-medium">
                  Mobile Phone *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="(555) 000-0000"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1 font-medium">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="client@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Service Requested
              </label>
              <input
                type="text"
                placeholder="e.g. Service Consultation, Session, or Checkup"
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1 font-medium">
                  Appointment Date
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1 font-medium">
                  Time Slot
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 10:30 AM"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Internal Appointment Notes
              </label>
              <textarea
                rows={2}
                placeholder="Special requests, intake requirements..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs resize-none"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" className="w-full">
                Save & Confirm Appointment
              </Button>
            </div>
          </form>
        </BottomSheet>
      )}
    </div>
  );
};

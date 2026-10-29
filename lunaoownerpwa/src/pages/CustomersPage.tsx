import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Phone,
  Mail,
  ChevronRight,
  Plus,
  UserPlus,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { Customer, Booking } from '../types';
import { customerService } from '../services/customerService';
import { bookingService } from '../services/bookingService';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { soundEffects } from '../utils/soundEffects';

export const CustomersPage: React.FC = () => {
  const { business, showToast } = useBusiness();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerNotes, setCustomerNotes] = useState('');
  const [filterWithEmailOnly, setFilterWithEmailOnly] = useState(false);
  const [, setIsLoading] = useState(true);

  // New Client Intake State
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientNotes, setNewClientNotes] = useState('');
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const [custList, bookList] = await Promise.all([
        customerService.getCustomers(),
        bookingService.getBookings(),
      ]);
      if (isMounted) {
        setCustomers(custList);
        setAllBookings(bookList);
        setIsLoading(false);
      }
    }
    load();

    const interval = setInterval(async () => {
      if (!isMounted) return;
      const [custList, bookList] = await Promise.all([
        customerService.getCustomers(),
        bookingService.getBookings(),
      ]);
      if (isMounted) {
        setCustomers(custList);
        setAllBookings(bookList);
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [business.id]);

  const handleSelectCustomer = (cust: Customer) => {
    soundEffects.playButtonClick();
    setSelectedCustomer(cust);
    setCustomerNotes(cust.notes || '');
  };

  const handleSaveNotes = async () => {
    if (!selectedCustomer) return;
    try {
      soundEffects.playSuccess();
      const updated = await customerService.updateCustomerNotes(
        selectedCustomer.id,
        customerNotes
      );
      setCustomers((prev) =>
        prev.map((c) => (c.id === selectedCustomer.id ? updated : c))
      );
      setSelectedCustomer(updated);
      showToast('Client notes saved');
    } catch {
      showToast('Failed to save notes');
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim() || !newClientPhone.trim()) return;

    setIsCreatingClient(true);
    try {
      soundEffects.playSuccess();
      const created = await customerService.createCustomer({
        name: newClientName.trim(),
        phone: newClientPhone.trim(),
        email: newClientEmail.trim() || undefined,
        notes: newClientNotes.trim() || undefined,
      });

      setCustomers((prev) => [created, ...prev]);
      setIsAddClientOpen(false);
      setNewClientName('');
      setNewClientPhone('');
      setNewClientEmail('');
      setNewClientNotes('');
      showToast(`Client profile for ${created.name} created`);
    } catch {
      showToast('Failed to create client profile');
    } finally {
      setIsCreatingClient(false);
    }
  };

  // Find bookings belonging to selected customer
  const customerBookings = selectedCustomer
    ? allBookings.filter(
        (b) =>
          b.customerPhone === selectedCustomer.phone ||
          (selectedCustomer.email && b.customerEmail === selectedCustomer.email)
      )
    : [];

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesEmailFilter = filterWithEmailOnly ? !!c.email : true;
    return matchesSearch && matchesEmailFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            Client Directory
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Customer directory and appointment history records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            onClick={() => {
              soundEffects.playButtonClick();
              setIsAddClientOpen(true);
            }}
          >
            New Client
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search client by name, phone, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              soundEffects.playTabSwitch();
              setFilterWithEmailOnly((prev) => !prev);
            }}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition min-h-[40px] flex items-center justify-center ${
              filterWithEmailOnly
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Has Email Address
          </button>
        </div>
      </div>

      {/* Customer List */}
      {filteredCustomers.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="No clients found"
          description={
            filterWithEmailOnly
              ? 'No clients with email addresses match your search.'
              : 'Client records appear here automatically as bookings are logged.'
          }
          actionLabel="Add Client Profile"
          onAction={() => {
            soundEffects.playButtonClick();
            setIsAddClientOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredCustomers.map((cust) => (
            <div
              key={cust.id}
              onClick={() => handleSelectCustomer(cust)}
              className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-xs cursor-pointer transition flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xs font-bold text-emerald-800 shrink-0">
                  {cust.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-emerald-800 truncate">
                    {cust.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {cust.phone}
                    {cust.email && ` • ${cust.email}`}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {cust.lastBookingDate
                      ? `Last visit: ${cust.lastBookingDate}`
                      : 'Last visit: None recorded'}
                    {` • ${cust.bookingCount} ${
                      cust.bookingCount === 1 ? 'appointment' : 'appointments'
                    }`}
                  </p>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* New Client Intake BottomSheet */}
      {isAddClientOpen && (
        <BottomSheet
          isOpen={isAddClientOpen}
          onClose={() => setIsAddClientOpen(false)}
          title="New Client Profile"
          subtitle="Record customer contact details for direct communication"
        >
          <form onSubmit={handleCreateClient} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Client Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Jordan Miller"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
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
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
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
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Staff Notes & Preferences
              </label>
              <textarea
                rows={3}
                placeholder="Intake notes, preferences, walk-in details..."
                value={newClientNotes}
                onChange={(e) => setNewClientNotes(e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs resize-none"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isCreatingClient}
              >
                {isCreatingClient ? 'Saving Profile...' : 'Save Client Profile'}
              </Button>
            </div>
          </form>
        </BottomSheet>
      )}

      {/* Customer Profile BottomSheet */}
      {selectedCustomer && (
        <BottomSheet
          isOpen={!!selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          title="Client Profile"
          subtitle={`Record ID: ${selectedCustomer.id}`}
        >
          <div className="space-y-4 text-xs">
            {/* Overview Card */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    {selectedCustomer.name}
                  </h4>
                  <p className="text-slate-600 mt-0.5">{selectedCustomer.phone}</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">
                    Total Visits
                  </span>
                  <p className="text-base font-bold text-slate-900 font-mono">
                    {selectedCustomer.bookingCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                <a
                  href={`tel:${selectedCustomer.phone.replace(/[^0-9]/g, '')}`}
                  onClick={() => soundEffects.playButtonClick()}
                  className="flex-1 h-10 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 font-medium transition shadow-2xs"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Call Phone</span>
                </a>

                {selectedCustomer.email ? (
                  <a
                    href={`mailto:${selectedCustomer.email}`}
                    onClick={() => soundEffects.playButtonClick()}
                    className="flex-1 h-10 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 font-medium transition shadow-2xs"
                  >
                    <Mail className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Send Email</span>
                  </a>
                ) : (
                  <span className="flex-1 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center text-[11px] italic select-none">
                    No email on file
                  </span>
                )}
              </div>
            </div>

            {/* Historical Booking Log */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-800">
                  Recorded Appointment History
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {customerBookings.length} on file
                </span>
              </div>

              {customerBookings.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center text-slate-500">
                  Booking history unavailable for this client.
                </div>
              ) : (
                <div className="space-y-2">
                  {customerBookings.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {b.service || 'Service Appointment'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {b.date} at {b.time}
                        </p>
                      </div>
                      <Badge
                        variant={
                          b.status === 'confirmed'
                            ? 'success'
                            : b.status === 'completed'
                            ? 'accent'
                            : 'neutral'
                        }
                        size="sm"
                      >
                        {b.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Private Notes */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                Staff Notes & Preferences
              </label>
              <textarea
                rows={3}
                placeholder="Add private operational notes about this client..."
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 resize-none text-xs shadow-2xs"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="primary" onClick={handleSaveNotes}>
                  Save Notes
                </Button>
              </div>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};

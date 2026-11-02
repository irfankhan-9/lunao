// SmsMessagingProfileModal.tsx
//
// Simple modal that explains what a messaging profile is and redirects the user
// to Telnyx portal to create one. Our software will auto-configure the webhook
// and country destinations once the user creates the profile.

import React, { useState } from 'react';
import { X, ExternalLink, AlertCircle, Globe, Webhook, Phone, Shield } from 'lucide-react';

interface SmsMessagingProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneNumber: string;
  accountEmail?: string;
  onOpenTelnyxPortal?: () => void;
}

export const SmsMessagingProfileModal: React.FC<SmsMessagingProfileModalProps> = ({
  isOpen,
  onClose,
  phoneNumber,
  accountEmail,
  onOpenTelnyxPortal,
}) => {
  const [isOpening, setIsOpening] = useState(false);

  if (!isOpen) return null;

  const handleOpenPortal = async () => {
    setIsOpening(true);
    try {
      // Get Telnyx portal URL
      const res = await fetch('/api/telnyx/portal-url', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        window.open(data.portalUrl, '_blank');
      }
    } catch (err) {
      console.error('[SmsMessagingProfileModal] Failed to get portal URL:', err);
    }
    setIsOpening(false);
    onOpenTelnyxPortal?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={() => onClose()}
    >
      <div
        className="bg-white border border-border-main rounded-xl max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-border-light flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Phone className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-serif text-ink">Create Messaging Profile</h3>
              <p className="text-xs text-ink-secondary">{phoneNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="p-2 hover:bg-off-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-ink-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-secondary">
            To send SMS from <span className="font-semibold text-ink">{phoneNumber}</span>, you need a 
            <span className="font-semibold text-ink"> Telnyx Messaging Profile</span> assigned to it.
          </p>

          {/* What is a messaging profile */}
          <div className="bg-off-white rounded-lg p-4">
            <p className="text-xs font-bold text-ink mb-2">What is a Messaging Profile?</p>
            <p className="text-xs text-ink-secondary mb-3">
              A messaging profile tells Telnyx how to handle SMS messages — where to send delivery reports, 
              which countries you can text, and how to receive replies.
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Webhook className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-ink-secondary">
                  <span className="font-semibold text-ink">Webhook URL</span> — receives inbound messages and delivery reports
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Globe className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-ink-secondary">
                  <span className="font-semibold text-ink">Country Destinations</span> — which countries you can send SMS to
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-ink-secondary">
                  <span className="font-semibold text-ink">Phone Assignment</span> — links this number to the profile
                </p>
              </div>
            </div>
          </div>

          {/* What we'll do */}
          <div className="border border-accent/30 bg-accent-soft/20 rounded-lg p-4">
            <p className="text-xs font-bold text-accent mb-2">After you create the profile:</p>
            <p className="text-xs text-ink-secondary">
              Lunao will automatically configure the webhook URL and add the necessary country destinations 
              so you can start sending SMS campaigns right away.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border-light flex gap-3">
          <button
            type="button"
            onClick={() => onClose()}
            className="flex-1 px-4 py-2 border border-border-main rounded-lg text-xs font-semibold text-ink hover:bg-off-white transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleOpenPortal}
            disabled={isOpening}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open Telnyx Portal
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmsMessagingProfileModal;

/**
 * Lunao Universal Booking Bridge v1.0
 * Ultra-resilient, schema-agnostic booking engine for AI-generated & template websites.
 * 
 * Capabilities:
 * - Zero-configuration form detection (data-lunao-booking, standard form inputs, or #booking forms)
 * - Anti-reload AJAX submission interception
 * - Tactile button morphing & in-page confirmation banner
 * - Studio Preview postMessage simulation (instant gratification test mode)
 * - Production /api/bookings JSON ingestion with arbitrary custom fields
 * - MutationObserver to auto-bind dynamically injected or re-rendered forms
 */
(function() {
  'use strict';

  if (window.__LUNAO_BOOKING_BRIDGE_INITIALIZED__) return;
  window.__LUNAO_BOOKING_BRIDGE_INITIALIZED__ = true;

  // Set global default booking endpoint so inline template scripts also use canonical origin-rooted /api/bookings
  var bridgeOrigin = window.location.origin || (window.location.protocol + '//' + window.location.host);
  window.LUNAO_BOOKING_API_URL = bridgeOrigin + '/api/bookings';

  var isIframe = false;
  try {
    isIframe = window.parent && window.parent !== window;
  } catch (e) {
    isIframe = true;
  }

  // Core contact field normalizers
  var NAME_KEYS = [
    'name', 'customer_name', 'customername', 'fullname', 'full_name', 'first_name',
    'client_name', 'clientname', 'formname', 'form_name', 'frm_name', 'frmname',
    'frm_fullname', 'frmfullname', 'contactname', 'contact_name', 'feasibilityname',
    'workshopcontactname', 'specimenname', 'warrantyclientname', 'revformname'
  ];
  var PHONE_KEYS = [
    'phone', 'tel', 'telephone', 'mobile', 'cell', 'phone_number', 'phonenumber',
    'clientphone', 'client_phone', 'formphone', 'form_phone', 'frm_phone', 'frmphone',
    'phonenum', 'phone_num', 'contactphone', 'contact_phone', 'feasibilityphone',
    'workshopcontactphone', 'specimenphone', 'warrantyphone'
  ];
  var EMAIL_KEYS = [
    'email', 'email_address', 'emailaddress', 'mail', 'clientemail', 'client_email',
    'formemail', 'form_email', 'frm_email', 'frmemail', 'contactemail', 'contact_email',
    'feasibilityemail', 'specimenemail', 'dispatchemail'
  ];
  var SERVICE_KEYS = [
    'service', 'services', 'treatment', 'package', 'plan', 'tier', 'service_type',
    'servicetype', 'type', 'bookingservice', 'booking_service', 'serviceselect',
    'service_select', 'serviceneeded', 'service_needed', 'frm_service', 'frmservice',
    'formgoal', 'form_goal', 'goal', 'workshoptype', 'propertytype', 'property_type',
    'warrantyyear', 'revformproject'
  ];
  var DATE_KEYS = [
    'date', 'service_date', 'servicedate', 'appointment_date', 'appointmentdate',
    'booking_date', 'bookingdate', 'day', 'frm_date', 'frmdate', 'dateinput', 'date_input'
  ];
  var TIME_KEYS = [
    'time', 'appointment_time', 'appointmenttime', 'booking_time', 'bookingtime',
    'slot', 'timeslot', 'time_slot', 'preferred_time', 'preferredtime', 'frm_time',
    'frmtime', 'timeinput', 'time_input'
  ];
  var NOTES_KEYS = [
    'notes', 'message', 'comments', 'details', 'special_requests', 'specialrequests',
    'description', 'bookingnotes', 'booking_notes', 'frm_notes', 'frmnotes',
    'formdesc', 'form_desc', 'desc', 'addressincity', 'address', 'feasibilitynotes',
    'feasibilityaddress', 'contactscope', 'specimennotes', 'specimenaddress',
    'warrantyadjustment', 'warrantyaddress', 'revformquote'
  ];

  function matchKey(name, list) {
    if (!name) return false;
    var clean = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return list.indexOf(clean) !== -1;
  }

  function resolveSiteSlug() {
    if (window.LUNAO_SLUG && typeof window.LUNAO_SLUG === 'string' && window.LUNAO_SLUG.indexOf('{') === -1) {
      var winSlug = window.LUNAO_SLUG.trim().toLowerCase();
      if (winSlug && winSlug !== 'preview') return winSlug;
    }
    var host = (window.location.hostname || '').toLowerCase();
    if (host.endsWith('.lunao.org')) {
      var sub = host.slice(0, -'.lunao.org'.length);
      if (sub && sub !== 'www' && sub !== 'api' && sub !== 'app' && sub !== 'admin' && sub.indexOf('.') === -1) {
        return sub;
      }
    }
    var rawPath = (window.location.pathname || '').replace(/^\/+|\/+$/g, '');
    if (rawPath) {
      var parts = rawPath.split('/').filter(Boolean);
      var sitesIdx = parts.indexOf('sites');
      if (sitesIdx !== -1 && parts[sitesIdx + 1]) {
        return parts[sitesIdx + 1].replace(/\.html?$/i, '').toLowerCase();
      }
      var lastPart = parts[parts.length - 1] || '';
      var cleaned = lastPart.replace(/\.html?$/i, '').toLowerCase();
      if (cleaned) return cleaned;
    }
    return 'studio-preview';
  }

  function extractPayloadFromForm(form) {
    var raw = {};

    // 1. Native FormData extraction (standard HTML inputs with name="")
    try {
      var formData = new FormData(form);
      formData.forEach(function(value, key) {
        if (value instanceof File) return;
        var strVal = String(value).trim();
        if (strVal) raw[key] = strVal;
      });
    } catch (e) {}

    // 2. Scan all form controls (including inputs that only have id="" and no name="")
    var allInputs = form.querySelectorAll('input, select, textarea');
    allInputs.forEach(function(el) {
      var tag = (el.tagName || '').toLowerCase();
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'reset' || type === 'hidden' || type === 'image') return;
      if ((type === 'checkbox' || type === 'radio') && !el.checked) return;

      var key = el.getAttribute('data-lunao-bind') || el.getAttribute('name') || el.getAttribute('id') || '';
      if (!key) return;
      // Privacy safeguard: skip Date of Birth fields
      if (/dob|birth/i.test(key)) return;

      var val = (el.value || '').trim();
      if (val && !raw[key]) {
        raw[key] = val;
      }
    });

    // 3. Normalize into Core Contacts
    var payload = {
      customerName: '',
      phone: '',
      email: '',
      service: '',
      date: '',
      time: '',
      notes: '',
      source: 'form',
      slug: resolveSiteSlug(),
      businessName: (window.LUNAO_BUSINESS_NAME && window.LUNAO_BUSINESS_NAME.indexOf('{') === -1)
        ? window.LUNAO_BUSINESS_NAME
        : (document.title || 'Local Business'),
      customFields: {}
    };

    var extraNotes = [];

    Object.keys(raw).forEach(function(key) {
      var val = raw[key];
      if (!val) return;
      var lowerKey = key.toLowerCase();
      if (/dob|birth|referral|frm_hear|frm_source/i.test(lowerKey)) {
        return;
      }

      if (!payload.customerName && matchKey(key, NAME_KEYS)) {
        payload.customerName = val;
      } else if (!payload.phone && matchKey(key, PHONE_KEYS)) {
        payload.phone = val;
      } else if (!payload.email && matchKey(key, EMAIL_KEYS)) {
        payload.email = val;
      } else if (!payload.service && matchKey(key, SERVICE_KEYS)) {
        payload.service = val;
      } else if (!payload.date && matchKey(key, DATE_KEYS)) {
        payload.date = val;
      } else if (!payload.time && matchKey(key, TIME_KEYS)) {
        payload.time = val;
      } else if (matchKey(key, NOTES_KEYS)) {
        if (!payload.notes) {
          payload.notes = val;
        } else if (payload.notes.indexOf(val) === -1) {
          extraNotes.push(val);
        }
      } else {
        if (val !== 'No Preference') {
          var cleanLabel = key.replace(/^(service_|frm_|form_)/i, '').replace(/[_-]+/g, ' ');
          extraNotes.push(cleanLabel + ': ' + val);
        }
      }
    });

    // 4. Explicit DOM fallbacks for forms with non-standard IDs
    if (!payload.customerName) {
      var nameEl = form.querySelector('input[id*="name" i], input[name*="name" i], input[type="text"]:not([type="hidden"])');
      if (nameEl && nameEl.value && nameEl.value.trim()) {
        payload.customerName = nameEl.value.trim();
      }
    }
    if (!payload.phone) {
      var phoneEl = form.querySelector('input[type="tel"], input[id*="phone" i], input[name*="phone" i]');
      if (phoneEl && phoneEl.value && phoneEl.value.trim()) {
        payload.phone = phoneEl.value.trim();
      }
    }
    if (!payload.email) {
      var emailEl = form.querySelector('input[type="email"], input[id*="email" i], input[name*="email" i]');
      if (emailEl && emailEl.value && emailEl.value.trim()) {
        payload.email = emailEl.value.trim();
      }
    }
    if (!payload.service) {
      var serviceEl = form.querySelector('select[id*="service" i], select[name*="service" i], select[id*="goal" i], select[name*="goal" i], select');
      if (serviceEl && serviceEl.value && serviceEl.value.trim()) {
        payload.service = serviceEl.value.trim();
      }
    }
    if (!payload.service) {
      payload.service = 'General Consultation';
    }
    if (!payload.date) {
      var dateEl = form.querySelector('input[type="date"]:not([id*="dob" i]):not([name*="dob" i])');
      if (dateEl && dateEl.value && dateEl.value.trim()) {
        payload.date = dateEl.value.trim();
      }
    }

    // 5. Normalize preferred time to contract-approved format
    if (payload.time) {
      var t = payload.time.trim();
      if (/^morning$/i.test(t)) {
        payload.time = '09:00 AM';
      } else if (/^afternoon$/i.test(t)) {
        payload.time = '01:00 PM';
      } else if (/^late\s*afternoon$/i.test(t)) {
        payload.time = '04:00 PM';
      } else if (/^evening$/i.test(t)) {
        payload.time = '05:00 PM';
      } else {
        var isFlexible = /^flexible$/i.test(t);
        var isTime12 = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM)$/i.test(t);
        var isTime24 = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t);
        if (!isFlexible && !isTime12 && !isTime24) {
          extraNotes.push('Preferred Time: ' + t);
          payload.time = 'Flexible';
        }
      }
    }

    if (extraNotes.length > 0) {
      var extraStr = extraNotes.join(' | ');
      payload.notes = payload.notes ? (payload.notes + ' | ' + extraStr) : extraStr;
    }

    // Attempt to extract business name from {{BUSINESS_NAME}} or header if not set via window.LUNAO_BUSINESS_NAME
    if (!window.LUNAO_BUSINESS_NAME || window.LUNAO_BUSINESS_NAME.indexOf('{') !== -1) {
      var headerEl = document.querySelector('header .logo, .logo, h1, .brand-title');
      if (headerEl && headerEl.innerText) {
        payload.businessName = headerEl.innerText.trim().slice(0, 60);
      }
    }

    return payload;
  }

  function isBookingForm(form) {
    if (!form || form.tagName !== 'FORM') return false;
    if (
      form.hasAttribute('data-lunao-skip-bridge')
    ) {
      return false;
    }
    if (form.hasAttribute('data-lunao-booking') || form.hasAttribute('data-booking-form')) return true;
    if (form.id && /booking|appointment|schedule|consultation/i.test(form.id)) return true;
    if (form.className && /booking|appointment|schedule|consultation/i.test(form.className)) return true;
    
    // Check if inside a booking container
    if (form.closest('#booking, #appointments, .booking-section, [data-section="booking"]')) return true;

    // Check inputs signature: forms that ask for phone, date, or appointment service
    var hasPhone = form.querySelector('input[type="tel"], input[name*="phone" i], [data-lunao-bind*="phone" i]');
    var hasDate = form.querySelector('input[type="date"], input[name*="date" i], select[name*="service" i]');
    if (hasPhone || hasDate) return true;

    return false;
  }

  function renderPwaActivationModal(data) {
    var old = document.getElementById('lunao-pwa-activation-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'lunao-pwa-activation-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(9,9,11,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:system-ui,-apple-system,sans-serif;animation:lunaoFadeIn 0.25s ease;';

    var pwaCode = data.pwaCode || data.code || 'LUNAO-PWA';
    var bName = data.businessName || 'Business';

    modal.innerHTML =
      '<div style="background:#09090b;border:1px solid rgba(245,158,11,0.35);border-radius:18px;max-width:440px;width:100%;padding:28px;color:#f4f4f5;box-shadow:0 25px 50px -12px rgba(0,0,0,0.8),0 0 30px rgba(245,158,11,0.15);text-align:center;position:relative;">' +
        '<button id="lunao-pwa-modal-close" style="position:absolute;top:16px;right:16px;background:none;border:none;color:#a1a1aa;font-size:20px;cursor:pointer;line-height:1;padding:4px;">✕</button>' +
        '<div style="width:52px;height:52px;border-radius:14px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#f59e0b;font-size:24px;">🔒</div>' +
        '<h3 style="margin:0 0 8px;font-size:19px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Owner PWA Activation Required</h3>' +
        '<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#a1a1aa;">Booking request saved! Live email & SMS automations for <strong style="color:#f4f4f5;">' + escapeHtmlStr(bName) + '</strong> are paused until activated in the Owner PWA.</p>' +
        '<div style="background:#18181b;border:1px dashed rgba(245,158,11,0.45);border-radius:12px;padding:16px;margin-bottom:20px;">' +
          '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#f59e0b;margin-bottom:6px;">Owner Activation Code</div>' +
          '<div style="font-family:monospace;font-size:21px;font-weight:700;letter-spacing:0.1em;color:#ffffff;margin-bottom:12px;" id="lunao-pwa-code-text">' + escapeHtmlStr(pwaCode) + '</div>' +
          '<button id="lunao-pwa-copy-btn" style="background:#f59e0b;color:#09090b;border:none;border-radius:8px;padding:8px 18px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.15s ease;">Copy Code</button>' +
        '</div>' +
        '<p style="margin:0 0 20px;font-size:12px;color:#71717a;line-height:1.4;">Redeem this code in your <strong>Lunao Owner PWA</strong> app to unlock live SMS and email notifications.</p>' +
        '<button id="lunao-pwa-modal-done" style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#f4f4f5;border-radius:10px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">Got It</button>' +
      '</div>';

    document.body.appendChild(modal);

    function closeModal() {
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    }

    document.getElementById('lunao-pwa-modal-close').addEventListener('click', closeModal);
    document.getElementById('lunao-pwa-modal-done').addEventListener('click', closeModal);

    var copyBtn = document.getElementById('lunao-pwa-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(pwaCode);
        } else {
          var input = document.createElement('input');
          input.value = pwaCode;
          document.body.appendChild(input);
          input.select();
          document.execCommand('copy');
          document.body.removeChild(input);
        }
        copyBtn.innerText = 'Copied! ✓';
        copyBtn.style.background = '#10b981';
        copyBtn.style.color = '#ffffff';
        setTimeout(function() {
          copyBtn.innerText = 'Copy Code';
          copyBtn.style.background = '#f59e0b';
          copyBtn.style.color = '#09090b';
        }, 2000);
      });
    }
  }

  function escapeHtmlStr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function handleFormSubmit(e) {
    var form = e.target;
    if (!isBookingForm(form)) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) {
      try { e.stopImmediatePropagation(); } catch (err) {}
    }

    var submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"])');
    var originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    var originalDisabled = submitBtn ? submitBtn.disabled : false;

    var payload = extractPayloadFromForm(form);

    // Basic client validation
    if (!payload.customerName && !payload.phone && !payload.email) {
      alert('Please provide your name or phone number so we can confirm your appointment.');
      return;
    }

    // Set tactile loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><svg style="animation:spin 1s linear infinite;width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Submitting Request…</span>';
    }

    function showSuccessUI() {
      if (submitBtn) {
        submitBtn.innerHTML = '✓ Request Received';
        submitBtn.style.backgroundColor = '#059669';
        submitBtn.style.borderColor = '#059669';
        submitBtn.style.color = '#ffffff';
      }

      // Check for existing or inject in-form confirmation banner
      var existingBanner = form.querySelector('.lunao-booking-success-banner');
      if (!existingBanner) {
        var banner = document.createElement('div');
        banner.className = 'lunao-booking-success-banner';
        banner.style.cssText = 'margin-top:14px;padding:12px 16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;color:#065f46;font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);animation:fadeIn 0.3s ease;';
        
        var nameStr = payload.customerName || 'there';
        var contactStr = payload.phone ? 'at ' + payload.phone : 'shortly';
        var dateNote = payload.date ? ' for ' + payload.date + (payload.time ? ' (' + payload.time + ')' : '') : '';
        banner.innerHTML = '<strong>Booking Request Received, ' + nameStr + '!</strong><br><span style="font-size:12px;color:#047857;">We have received your requested time' + dateNote + '. We will contact you ' + contactStr + ' to confirm availability and finalize details.</span>';
        
        form.appendChild(banner);
      }

      // Reset form after delay
      setTimeout(function() {
        try { form.reset(); } catch (e) {}
        if (submitBtn) {
          submitBtn.disabled = originalDisabled;
          submitBtn.innerHTML = originalBtnHtml;
          submitBtn.style.backgroundColor = '';
          submitBtn.style.borderColor = '';
          submitBtn.style.color = '';
        }
      }, 5000);
    }

    function showErrorUI(errMsg) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '✕ Booking Failed — Action Required';
        submitBtn.style.backgroundColor = '#dc2626';
        submitBtn.style.borderColor = '#dc2626';
        submitBtn.style.color = '#ffffff';
        setTimeout(function() {
          if (submitBtn) {
            submitBtn.disabled = originalDisabled;
            submitBtn.innerHTML = originalBtnHtml;
            submitBtn.style.backgroundColor = '';
            submitBtn.style.borderColor = '';
            submitBtn.style.color = '';
          }
        }, 3500);
      }

      var existingError = form.querySelector('.lunao-booking-error-banner');
      if (existingError) {
        try { existingError.remove(); } catch (e) {}
      }

      var banner = document.createElement('div');
      banner.className = 'lunao-booking-error-banner';
      banner.style.cssText = 'margin-top:14px;padding:14px 16px;background:#fef2f2;border:1.5px solid #ef4444;border-radius:10px;color:#991b1b;font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;text-align:center;box-shadow:0 4px 12px rgba(239,68,68,0.15);animation:fadeIn 0.3s ease;';
      banner.innerHTML = '<strong style="color:#dc2626;display:block;margin-bottom:4px;">⚠️ Action Required</strong><span style="font-size:12px;color:#b91c1c;">' + escapeHtmlStr(errMsg || 'Generate QR code for this site inside Lunao first to activate bookings.') + '</span>';
      form.appendChild(banner);
    }

    // Canonical same-origin booking persistence
    var idempotencyKey = 'bk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    
    // Canonical same-origin endpoint rooted strictly at origin (never relative to slug)
    var origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
    var bookingUrl = origin + '/api/bookings';

    function sendBookingRequest() {
      return fetch(bookingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(payload)
      }).then(function(res) {
        return res.json().catch(function() { return null; }).then(function(data) {
          if (!res.ok || (data && (data.ok === false || data.code === 'PWA_ACTIVATION_REQUIRED' || data.pwaActive === false))) {
            var errMsg = (data && (data.error || data.message)) || ('Booking rejected by server (HTTP ' + res.status + ').');
            throw new Error(errMsg);
          }
          return data || { ok: true, id: idempotencyKey, booking: payload };
        });
      });
    }

    sendBookingRequest()
      .then(function(resData) {
        var existingError = form.querySelector('.lunao-booking-error-banner');
        if (existingError) {
          try { existingError.remove(); } catch (e) {}
        }
        showSuccessUI();

        if (isIframe) {
          try {
            window.parent.postMessage({
              type: 'LUNAO_CONFIRMED_BOOKING',
              data: resData.booking || payload,
              id: resData.id || idempotencyKey,
              pwaActive: true,
              timestamp: Date.now()
            }, '*');
          } catch (postErr) {
            console.warn('[LunaoBookingBridge] postMessage notice:', postErr);
          }
        }
      })
      .catch(function(err) {
        console.error('[LunaoBookingBridge] Booking persistence failed:', err.message);
        showErrorUI(err.message);

        if (isIframe) {
          try {
            window.parent.postMessage({
              type: 'LUNAO_BOOKING_ERROR',
              error: err.message,
              timestamp: Date.now()
            }, '*');
          } catch (e) {}
        }
      });
  }

  function bindForms() {
    var forms = document.querySelectorAll('form');
    forms.forEach(function(f) {
      if (f.__lunao_bound__) return;
      if (isBookingForm(f)) {
        f.__lunao_bound__ = true;
        f.addEventListener('submit', handleFormSubmit, true);
      }
    });
  }

  // Intercept all booking submissions at document capture phase before any inline template scripts
  try {
    document.addEventListener('submit', function(e) {
      var form = e.target;
      if (form && form.tagName === 'FORM' && isBookingForm(form)) {
        handleFormSubmit(e);
      }
    }, true);
  } catch (e) {}

  // Initial binding
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindForms);
  } else {
    bindForms();
  }

  // Auto-bind any forms dynamically injected by AI preview or client scripts
  try {
    var observer = new MutationObserver(function() {
      bindForms();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  } catch (e) {}

  if (typeof window.handleBarberBooking !== 'function') {
    window.handleBarberBooking = function(e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
    };
  }

  // Expose API for programmatic triggers & inspection
  window.LunaoBooking = {
    version: '1.1.0',
    bindForms: bindForms,
    extractPayload: extractPayloadFromForm
  };
})();

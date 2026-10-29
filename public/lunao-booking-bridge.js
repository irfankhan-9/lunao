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

  var isIframe = false;
  try {
    isIframe = window.parent && window.parent !== window;
  } catch (e) {
    isIframe = true;
  }

  // Core contact field normalizers
  var NAME_KEYS = ['name', 'customer_name', 'customername', 'fullname', 'full_name', 'first_name', 'client_name'];
  var PHONE_KEYS = ['phone', 'tel', 'telephone', 'mobile', 'cell', 'phone_number', 'phonenumber'];
  var EMAIL_KEYS = ['email', 'email_address', 'mail'];
  var SERVICE_KEYS = ['service', 'treatment', 'package', 'plan', 'tier', 'service_type', 'type'];
  var DATE_KEYS = ['date', 'service_date', 'appointment_date', 'booking_date', 'day'];
  var TIME_KEYS = ['time', 'appointment_time', 'booking_time', 'slot', 'preferred_time'];
  var NOTES_KEYS = ['notes', 'message', 'comments', 'details', 'special_requests', 'description'];

  function matchKey(name, list) {
    if (!name) return false;
    var clean = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return list.indexOf(clean) !== -1;
  }

  function extractPayloadFromForm(form) {
    var raw = {};
    
    // 1. Native FormData extraction (standard HTML inputs)
    try {
      var formData = new FormData(form);
      formData.forEach(function(value, key) {
        if (value instanceof File) return;
        var strVal = String(value).trim();
        if (strVal) raw[key] = strVal;
      });
    } catch (e) {}

    // 2. data-lunao-bind override/fallback
    var boundInputs = form.querySelectorAll('[data-lunao-bind]');
    boundInputs.forEach(function(el) {
      var bindKey = el.getAttribute('data-lunao-bind');
      var val = (el.value || el.innerText || '').trim();
      if (bindKey && val) raw[bindKey] = val;
    });

    // 3. Normalize into Core Contacts + Schema-Agnostic customFields
    var payload = {
      customerName: '',
      phone: '',
      email: '',
      service: '',
      date: '',
      time: '',
      notes: '',
      source: 'website_form',
      slug: (window.location.pathname.replace(/^\/|\/$/g, '') || 'studio-preview'),
      businessName: document.title || 'Local Business',
      customFields: {}
    };

    Object.keys(raw).forEach(function(key) {
      var val = raw[key];

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
      } else if (!payload.notes && matchKey(key, NOTES_KEYS)) {
        payload.notes = val;
      } else {
        payload.customFields[key] = val;
      }
    });

    // Fallback: if no explicit name was matched, pick the first non-empty text input
    if (!payload.customerName) {
      var textInputs = form.querySelectorAll('input[type="text"]:not([type="hidden"])');
      if (textInputs.length > 0 && textInputs[0].value.trim()) {
        payload.customerName = textInputs[0].value.trim();
      }
    }

    // Attempt to extract business name from {{BUSINESS_NAME}} or header
    var headerEl = document.querySelector('header, .logo, h1, .brand-title');
    if (headerEl && headerEl.innerText) {
      payload.businessName = headerEl.innerText.trim().slice(0, 60);
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
        submitBtn.disabled = originalDisabled;
        submitBtn.innerHTML = originalBtnHtml;
        submitBtn.style.backgroundColor = '';
        submitBtn.style.borderColor = '';
        submitBtn.style.color = '';
      }

      var existingError = form.querySelector('.lunao-booking-error-banner');
      if (!existingError) {
        var banner = document.createElement('div');
        banner.className = 'lunao-booking-error-banner';
        banner.style.cssText = 'margin-top:14px;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#991b1b;font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);animation:fadeIn 0.3s ease;';
        banner.innerHTML = '<strong>Request could not be sent</strong><br><span style="font-size:12px;color:#b91c1c;">' + (errMsg || 'Please verify your details and try again or call us directly.') + '</span>';
        form.appendChild(banner);
        setTimeout(function() {
          try { banner.remove(); } catch(e) {}
        }, 7000);
      }
    }

    // Strict persistence with automatic multi-endpoint failover
    var idempotencyKey = 'bk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    var supabaseEndpoint = 'https://wqlbuadknltsjfzrltpe.supabase.co/functions/v1/public-bookings';
    var appletEndpoint = 'https://ais-dev-g3eqvrjyk7ivct6g6iyvyz-570409437174.asia-southeast1.run.app/api/bookings';

    function sendBookingRequest(url) {
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(payload)
      }).then(function(res) {
        var contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
        if (res.ok || res.status === 200 || res.status === 403) {
          if (contentType.indexOf('application/json') !== -1) {
            return res.json().then(function(data) {
              if (data && data.code === 'PWA_ACTIVATION_REQUIRED') {
                return data;
              }
              if (data && data.ok === false) {
                throw new Error(data.error || 'Server rejected booking confirmation.');
              }
              return data;
            });
          }
          return { ok: true, id: idempotencyKey, booking: payload };
        }
        return res.json().then(function(data) {
          if (data && data.code === 'PWA_ACTIVATION_REQUIRED') {
            return data;
          }
          throw new Error(data.error || ('HTTP ' + res.status + ' error'));
        }).catch(function(err) {
          if (err && err.code === 'PWA_ACTIVATION_REQUIRED') return err;
          throw new Error('HTTP ' + res.status + ' error');
        });
      });
    }

    // Try primary endpoint first, then failover to alternate endpoint
    var isPagesDev = /\.pages\.dev$/i.test(window.location.hostname || '');
    var primaryUrl = isPagesDev ? supabaseEndpoint : '/api/bookings';
    var fallbackUrl = isPagesDev ? appletEndpoint : '/api/bookings';

    sendBookingRequest(primaryUrl)
      .catch(function(primaryErr) {
        console.warn('[LunaoBookingBridge] Primary endpoint (' + primaryUrl + ') failed:', primaryErr.message, '— attempting fallback to:', fallbackUrl);
        return sendBookingRequest(fallbackUrl);
      })
      .then(function(resData) {
        showSuccessUI();

        if (resData && (resData.code === 'PWA_ACTIVATION_REQUIRED' || resData.pwaActive === false)) {
          renderPwaActivationModal(resData);
        }

        if (isIframe) {
          try {
            window.parent.postMessage({
              type: 'LUNAO_CONFIRMED_BOOKING',
              data: resData.booking || payload,
              id: resData.id || idempotencyKey,
              pwaActive: resData.pwaActive !== false,
              pwaCode: resData.pwaCode,
              timestamp: Date.now()
            }, '*');
          } catch (postErr) {
            console.warn('[LunaoBookingBridge] postMessage notice:', postErr);
          }
        }
      })
      .catch(function(err) {
        console.error('[LunaoBookingBridge] Booking persistence failed across endpoints:', err.message);
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

  // Expose API for programmatic triggers & inspection
  window.LunaoBooking = {
    version: '1.0.0',
    bindForms: bindForms,
    extractPayload: extractPayloadFromForm
  };
})();

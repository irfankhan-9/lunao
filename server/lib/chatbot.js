// Small booking chatbot. Two engines, identical contract:
//   - Gemini 2.5 Flash Lite when GEMINI_API_KEY is set (natural, persuasive).
//   - A deterministic rule-based slot-filling agent otherwise (always works).
// Both collect: name -> service -> date -> time -> phone, then create a booking.
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';
import { gemini as geminiCfg } from './config.js';
import { createBookingAsync } from './bookings.js';
import { supabaseSaveChatMessage } from './supabase.js';

// Ordered booking fields. Each carries the question the bot asks + a keyword
// used to recognise (in saved assistant text) which field was last requested.
const FIELDS = [
  { key: 'name', keyword: 'name', ask: "Hi there! I'd love to get you booked in. What's your name?" },
  { key: 'service', keyword: 'service', ask: (s) => `Great to meet you, ${s.name}! Which service would you like to book?` },
  { key: 'date', keyword: 'date', ask: 'Perfect choice. What date works best for you?' },
  { key: 'time', keyword: 'time', ask: 'Got it. And what time would you prefer?' },
  { key: 'phone', keyword: 'phone', ask: "Almost done! What's the best phone number to confirm your booking?" },
];

const detectField = (assistantText = '') => {
  const t = assistantText.toLowerCase();
  if (t.includes('phone')) return 'phone';
  if (t.includes('service')) return 'service';
  if (t.includes('date')) return 'date';
  if (t.includes('time')) return 'time';
  if (t.includes('name')) return 'name';
  return null;
};

// ---- DB helpers ------------------------------------------------------------

function getOrCreateSession(slug, sessionId) {
  if (sessionId) {
    const row = db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(sessionId);
    if (row) return sessionId;
  }
  const id = randomUUID();
  db.prepare('INSERT INTO chat_sessions (id, slug, created_at) VALUES (?, ?, ?)').run(id, slug, Date.now());
  return id;
}

function saveMessage(sessionId, slug, role, content) {
  db.prepare(
    'INSERT INTO chat_messages (session_id, slug, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, slug, role, content, Date.now());

  // Background sync to Supabase
  supabaseSaveChatMessage(sessionId, slug, role, content).catch((err) => {
    console.warn('[chatbot] Supabase chat sync notice:', err.message);
  });
}

function getMessages(sessionId) {
  return db
    .prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId);
}

// ---- Slot extraction (shared) ---------------------------------------------

// Rebuild collected slots by pairing each assistant question with the user's
// reply that followed it. Robust to greetings / off-topic chatter.
function collectSlots(messages) {
  const slots = {};
  let lastAsked = null;
  for (const m of messages) {
    if (m.role === 'assistant') {
      lastAsked = detectField(m.content);
    } else if (m.role === 'user' && lastAsked && !slots[lastAsked]) {
      slots[lastAsked] = extractValue(lastAsked, m.content);
      lastAsked = null;
    }
  }
  return slots;
}

function extractValue(field, raw) {
  const text = (raw || '').trim();
  if (field === 'phone') {
    const digits = text.replace(/[^\d+]/g, '');
    return digits || text;
  }
  if (field === 'name') {
    // Strip common filler so "hi, I'm John" -> "John".
    return text.replace(/^(hi|hello|hey|yo|it'?s|i am|i'?m|my name is|this is)[\s,]*/i, '').trim() || text;
  }
  return text;
}

function nextMissingField(slots) {
  return FIELDS.find((f) => !slots[f.key]) || null;
}

async function bookFromSlots(slug, slots, businessName, source) {
  return await createBookingAsync({
    slug,
    businessName,
    customerName: slots.name,
    phone: slots.phone,
    service: slots.service,
    date: slots.date,
    time: slots.time,
    source,
  });
}

// ---- Rule-based engine -----------------------------------------------------

function ruleReply(slots, businessName) {
  const next = nextMissingField(slots);
  if (!next) return null; // all collected
  const ask = typeof next.ask === 'function' ? next.ask(slots) : next.ask;
  return ask;
}

// ---- Gemini engine ---------------------------------------------------------

let genai = null;
function getGenAI() {
  if (!geminiCfg.live) return null;
  if (!genai) genai = new GoogleGenAI({ apiKey: geminiCfg.apiKey });
  return genai;
}

function geminiSystem(businessName, services, slots) {
  return [
    `You are a warm, concise booking assistant for "${businessName || 'this business'}".`,
    services ? `Services offered: ${services}.` : '',
    'Your single goal is to book an appointment by collecting, in order: name, service, date, time, phone.',
    'Ask for ONLY ONE missing detail per reply. Keep replies under 30 words, friendly and persuasive.',
    `Already collected: ${JSON.stringify(slots)}.`,
    'When ALL five fields are collected, reply with a short enthusiastic confirmation summarising the booking.',
    'Always respond with STRICT JSON only: {"reply": string, "complete": boolean}. No markdown, no extra text.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function geminiReply(messages, slots, businessName, services) {
  const ai = getGenAI();
  if (!ai) return null;
  const history = messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Customer'}: ${m.content}`)
    .join('\n');
  try {
    const res = await ai.models.generateContent({
      model: geminiCfg.model,
      contents: `${geminiSystem(businessName, services, slots)}\n\nConversation so far:\n${history}\n\nReply as JSON now.`,
      config: { temperature: 0.6, maxOutputTokens: 200 },
    });
    const text = (res.text || '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { reply: text || null };
    const parsed = JSON.parse(match[0]);
    return { reply: parsed.reply || null };
  } catch {
    return null; // fall back to rule-based on any failure
  }
}

// ---- Public turn handler ---------------------------------------------------

export async function chatTurn({ slug, sessionId, message, businessName, services } = {}) {
  if (!slug) {
    const err = new Error('slug is required.');
    err.status = 400;
    throw err;
  }

  const sid = getOrCreateSession(slug, sessionId);
  const text = (message || '').trim();

  // Opening turn (widget opens with empty message): greet + ask first field.
  if (!text) {
    const existing = getMessages(sid);
    if (existing.length === 0) {
      const greeting = FIELDS[0].ask;
      saveMessage(sid, slug, 'assistant', greeting);
      return { sessionId: sid, reply: greeting, booking: null, done: false };
    }
    const last = existing.filter((m) => m.role === 'assistant').pop();
    return { sessionId: sid, reply: last ? last.content : FIELDS[0].ask, booking: null, done: false };
  }

  saveMessage(sid, slug, 'user', text);

  const messages = getMessages(sid);
  const slots = collectSlots(messages);
  const complete = !nextMissingField(slots);

  let booking = null;
  let reply;

  if (complete) {
    booking = await bookFromSlots(slug, slots, businessName, 'chatbot');
    reply =
      `You're all set, ${slots.name}! I've booked your ${slots.service} for ${slots.date} at ${slots.time}. ` +
      `We'll confirm at ${slots.phone}. See you soon! 🎉`;
  } else {
    // Prefer Gemini's natural phrasing; fall back to the deterministic prompt.
    const g = await geminiReply(messages, slots, businessName, services);
    reply = (g && g.reply) || ruleReply(slots, businessName);
  }

  saveMessage(sid, slug, 'assistant', reply);
  return { sessionId: sid, reply, booking, done: complete };
}

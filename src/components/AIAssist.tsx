import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Send, X, Loader } from 'lucide-react';

type ParsedDonation = {
  food_item: string;
  quantity: string;
  location: string;
  expiry_time: string;
  urgency_hint: string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AIAssistProps = {
  setFood: (value: string) => void;
  setQuantity: (value: string) => void;
  setLocation: (value: string) => void;
  setExpiry: (value: string) => void;
  onAutoFill?: () => void;
  onUrgencyDetected?: (urgency: 'HIGH' | 'MEDIUM' | 'LOW') => void;
};

const REQUIRED_JSON_KEYS: Array<keyof ParsedDonation> = [
  'food_item',
  'quantity',
  'location',
  'expiry_time',
  'urgency_hint',
];

const SYSTEM_PROMPT = `You are an AI assistant for a food donation app.
Extract structured data and return ONLY JSON:
{
  "food_item": "",
  "quantity": "",
  "location": "",
  "expiry_time": "",
  "urgency_hint": ""
}
Rules:
- HIGH if expiry < 2 hours
- MEDIUM if 2–6 hours
- LOW if > 6 hours`;

function toExpiryOption(value: string): 'within-1-hour' | 'within-2-hours' | 'within-4-hours' | 'today' {
  const normalized = value.toLowerCase();

  if (normalized.includes('1 hour') || normalized.includes('less than 1') || normalized.includes('30 min')) {
    return 'within-1-hour';
  }
  if (normalized.includes('2 hour') || normalized.includes('high')) {
    return 'within-2-hours';
  }
  if (normalized.includes('4 hour') || normalized.includes('3 hour') || normalized.includes('medium')) {
    return 'within-4-hours';
  }

  return 'today';
}


function parseDonationFromText(input: string, detectedLocation: string): ParsedDonation {
  const text = input.toLowerCase();

  // quantity
  const quantityMatch = text.match(/\d+/);
  const quantity = quantityMatch ? quantityMatch[0] : '1';

  // food
  const foodMatch = text.match(/(rice|meals|food|snacks)/);
  const food_item = foodMatch ? foodMatch[0] : 'Food donation';

  // location (clean extraction)
  const locationMatch = text.match(/in ([a-zA-Z\s]+)/);
  let location = locationMatch ? locationMatch[1] : detectedLocation || 'Auto-detected';

  // REMOVE extra words like "expires..."
  location = location.replace(/expires.*$/, '').trim();

  // expiry hours
  const expiryMatch = text.match(/(\d+)\s*(hour|hours)/);
  const expiryHours = expiryMatch ? parseInt(expiryMatch[1]) : 24;
  const expiry_time = expiryHours <= 2 ? 'within-1-hour' : expiryHours <= 4 ? 'within-2-hours' : 'within-4-hours';

  // urgency
  let urgency_hint: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (expiryHours <= 2) urgency_hint = 'HIGH';
  else if (expiryHours <= 6) urgency_hint = 'MEDIUM';

  return { food_item, quantity, location, expiry_time, urgency_hint };
}

function extractJson(text: string): ParsedDonation {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i);
  const candidate = codeBlockMatch ? codeBlockMatch[1] : text;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;

  const parsed = JSON.parse(jsonText) as unknown;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response JSON is not a valid object.');
  }

  const record = parsed as Record<string, unknown>;
  for (const key of REQUIRED_JSON_KEYS) {
    if (!(key in record)) {
      throw new Error(`AI response is missing required key: ${key}`);
    }
    if (typeof record[key] !== 'string') {
      throw new Error(`AI response key '${key}' must be a string.`);
    }
  }

  return {
    food_item: (record.food_item as string).trim(),
    quantity: (record.quantity as string).trim(),
    location: (record.location as string).trim(),
    expiry_time: (record.expiry_time as string).trim(),
    urgency_hint: (record.urgency_hint as string).trim(),
  };
}

export default function AIAssist({ setFood, setQuantity, setLocation, setExpiry, onAutoFill, onUrgencyDetected }: AIAssistProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedLocation, setDetectedLocation] = useState<string>('');

  const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading]);

  const detectLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDetectedLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      },
      () => {
        setDetectedLocation('');
      }
    );
  };

  useEffect(() => {
    if (isOpen && !detectedLocation) {
      detectLocation();
    }
  }, [isOpen, detectedLocation]);

  const sendMessage = async () => {
    if (!canSend) return;

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
      setError('Missing VITE_GEMINI_API_KEY in environment.');
      return;
    }

    const userPrompt = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userPrompt }]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: `${SYSTEM_PROMPT}

User input: ${userPrompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      };

      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };

        const modelText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!modelText) {
          throw new Error('No AI response received from Gemini.');
        }

        const structured = extractJson(modelText);
        const resolvedQuantity = structured.quantity.trim() || '1';
        const resolvedLocation = structured.location.trim() || detectedLocation || 'Auto-detected';
        const resolvedExpiry = toExpiryOption(structured.expiry_time || structured.urgency_hint);
        const resolvedFood = structured.food_item.trim() || userPrompt;

        setFood(resolvedFood);
        setQuantity(resolvedQuantity);
        setLocation(resolvedLocation);
        setExpiry(resolvedExpiry);
        onUrgencyDetected?.(structured.urgency_hint as 'HIGH' | 'MEDIUM' | 'LOW');

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `✅ Parsed:
Food: ${resolvedFood}
Qty: ${resolvedQuantity}
Location: ${resolvedLocation}
Expiry: ${resolvedExpiry}`,
          },
        ]);

        if (onAutoFill) {
          setTimeout(() => onAutoFill(), 400);
        }

        return;
      }

      const errorText = await response.text();
      const isQuotaOrUnavailable = response.status === 429 || /quota|rate limit|resource_exhausted|not found|unsupported/i.test(errorText);
      if (isQuotaOrUnavailable) {
        const fallback = parseDonationFromText(userPrompt, detectedLocation);
        setFood(fallback.food_item);
        setQuantity(fallback.quantity);
        setLocation(fallback.location);
        setExpiry(fallback.expiry_time);
        onUrgencyDetected?.(fallback.urgency_hint as 'HIGH' | 'MEDIUM' | 'LOW');

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `✅ Parsed locally due to Gemini quota limit:
Food: ${fallback.food_item}
Qty: ${fallback.quantity}
Location: ${fallback.location}
Expiry: ${fallback.expiry_time}
Urgency: ${fallback.urgency_hint}`,
          },
        ]);

        if (onAutoFill) {
          setTimeout(() => onAutoFill(), 400);
        }

        return;
      }

      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to parse your message right now.';
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `❌ Error: ${message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl border border-[#7FAFE0]/50 bg-[#7FAFE0]/20 px-4 py-2.5 text-sm font-semibold text-[#1F548C] transition hover:bg-[#7FAFE0]/30"
      >
        <Sparkles size={15} />
        ✨ AI Assist
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/95 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-800">AI Donation Assistant</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close AI Assist"
              >
                <X size={16} />
              </button>
            </div>

            <div className="h-72 space-y-3 overflow-y-auto px-4 py-3">
              {detectedLocation ? (
                <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  📍 Location auto-detected: {detectedLocation}
                </p>
              ) : (
                <p className="rounded-2xl bg-blue-50 px-3 py-2 text-sm text-blue-700 flex items-center gap-2">
                  <Loader size={14} className="animate-spin" />
                  Detecting your location...
                </p>
              )}

              {messages.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Describe your donation naturally. Example: "50 veg meals in Koramangala expires in 2 hours".
                </p>
              ) : null}

              {messages.map((message, idx) => (
                <div
                  key={`${message.role}-${idx}`}
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'ml-auto bg-[#7FAFE0]/20 text-slate-800'
                      : 'mr-auto bg-slate-100 text-slate-700'
                  }`}
                >
                  {message.content}
                </div>
              ))}

              {isLoading ? (
                <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                  <Loader size={12} className="animate-spin" />
                  Analyzing your donation...
                </p>
              ) : null}
              {error ? <p className="text-xs font-medium text-rose-600">⚠️ {error}</p> : null}
            </div>

            <div className="border-t border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canSend) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="e.g., 50 veg meals or non-veg..."
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#7FAFE0] focus:ring-4 focus:ring-[#7FAFE0]/20"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!canSend}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1F548C] text-white transition hover:bg-[#173f69] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

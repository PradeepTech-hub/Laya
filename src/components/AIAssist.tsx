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
    food_item: record.food_item.trim(),
    quantity: record.quantity.trim(),
    location: record.location.trim(),
    expiry_time: record.expiry_time.trim(),
    urgency_hint: record.urgency_hint.trim(),
  };
}

export default function AIAssist({ setFood, setQuantity, setLocation, setExpiry, onAutoFill }: AIAssistProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedLocation, setDetectedLocation] = useState<string>('');

  const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading]);

  const detectLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location detection not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDetectedLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError('Could not detect location. Please enter manually.');
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
    const nextUserMsg: ChatMessage = { role: 'user', content: userPrompt };

    setMessages((prev) => [...prev, nextUserMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: `${SYSTEM_PROMPT}\n\nUser input: ${userPrompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Gemini API error response:', errData);
        throw new Error(`Gemini API error (${response.status}): ${JSON.stringify(errData)}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const modelText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!modelText) {
        throw new Error('No AI response received from Gemini.');
      }

      const structured = extractJson(modelText);

      setFood(structured.food_item);
      setQuantity(structured.quantity || '1');
      setLocation(structured.location || detectedLocation);
      setExpiry(toExpiryOption(structured.expiry_time || structured.urgency_hint));

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `✅ Parsed:\nFood: ${structured.food_item}\nQty: ${structured.quantity}\nLocation: ${structured.location}\nExpiry: ${structured.urgency_hint}`,
        },
      ]);

      if (onAutoFill) {
        setTimeout(() => onAutoFill(), 500);
      }
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
              {detectedLocation && (
                <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  📍 Location auto-detected: {detectedLocation}
                </p>
              )}

              {messages.length === 0 && !detectedLocation ? (
                <p className="rounded-2xl bg-blue-50 px-3 py-2 text-sm text-blue-700 flex items-center gap-2">
                  <Loader size={14} className="animate-spin" />
                  Detecting your location...
                </p>
              ) : null}

              {messages.length === 0 && detectedLocation ? (
                <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Describe your donation briefly. Example: "50 veg meals" or "100 packed snacks expires in 2 hours"
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
                  onKeyPress={(e) => e.key === 'Enter' && canSend && sendMessage()}
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

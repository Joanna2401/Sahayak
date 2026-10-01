import 'dotenv/config';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import path from 'path';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Body parsers
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Multer memory storage for audio uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function cleanJson(s: string): string {
  const stripped = s.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return stripped.slice(start, end + 1);
  }
  return stripped;
}

const SUPPORTED_LANGUAGES = [
  'en', 'hi', 'ta', 'te', 'kn', 'ml', 'bn', 'mr', 'gu', 'pa', 'ur', 'or', 'as',
  'es', 'fr', 'de', 'ar', 'zh', 'ja', 'ko', 'pt', 'ru', 'it', 'nl', 'id', 'ms',
  'th', 'vi', 'tr', 'sw', 'ne', 'si'
] as const;

const ALLOWED_ACTIONS = [
  'scheme',
  'documents',
  'location',
  'official_website',
  'check_eligibility',
  'next_step',
  'read',
  'stop',
  'replay',
  'home',
  'unknown',
] as const;
type AllowedAction = typeof ALLOWED_ACTIONS[number];

const PROMPT_INSTRUCTIONS = `You are the multilingual voice intelligence engine for "SAHAYAK AI" (tagline: "Your Voice. Your Language. Your Government Services."), a voice-first intelligent assistant helping citizens access Indian Central Government and State Government welfare schemes (e.g. Pradhan Mantri Ujjwala Yojana for free LPG gas, Aadhaar/ration card documents, and Common Service Centers).

The service scope is strictly Indian Government Services, but the language capability is global.
Detect the language from the input speech or text. Supported languages include:
English (en), Hindi (hi), Tamil (ta), Telugu (te), Kannada (kn), Malayalam (ml), Bengali (bn), Marathi (mr), Gujarati (gu), Punjabi (pa), Urdu (ur), Odia (or), Assamese (as), Nepali (ne), Sinhala (si), Spanish (es), French (fr), German (de), Arabic (ar), Chinese (zh), Japanese (ja), Korean (ko), Portuguese (pt), Russian (ru), Italian (it), Dutch (nl), Indonesian (id), Malay (ms), Thai (th), Vietnamese (vi), Turkish (tr), Swahili (sw), or any other global language ISO code.

Determine the user's action and intent:
- 'scheme': The user is inquiring about Indian government assistance, welfare schemes, LPG/gas cylinder connection (Ujjwala/PMUY), subsidies, financial help, or benefit schemes.
- 'documents': The user is asking what documents/certificates/papers/proofs are needed, like Aadhaar, ration card, bank passbook, or voter ID.
- 'location': The user is asking for nearby citizen service centers, seva kendra, CSC, where to go, address, or local centers.
- 'official_website': The user is asking to open or visit the official application portal or website (e.g., "Open official website", "Take me to official portal", "Open PMUY portal").
- 'check_eligibility': The user is asking to check or test their eligibility, or asking "Am I eligible?".
- 'next_step': The user is asking for the next step, following up on a previous step, or asking "What is the next step?".
- 'read': The user wants the page or information read aloud or explained.
- 'stop': The user wants the voice to stop speaking ("Stop speaking", "Stop", "Pause").
- 'replay': The user wants to replay or hear the response again ("Read that again", "Repeat", "Replay").
- 'home': The user wants to return home, start over, or go back.
- 'unknown': Other queries, greetings, or conversational assistance about Indian Government Central, State, and UT services.

Return ONLY a single valid JSON object with NO extra text or markdown:
{
  "language": "two_letter_code (e.g. en, hi, ta, te, kn, ml, bn, mr, gu, pa, ur, or, as, es, fr, de, ar, zh, ja, ko, pt, ru, etc.)",
  "languageName": "English name of language (e.g. Tamil, French, Spanish)",
  "nativeName": "Native script name of language (e.g. தமிழ், Français, Español)",
  "transcript": "Exact transcription of user spoken words in the native script or text",
  "action": "scheme" | "documents" | "location" | "official_website" | "check_eligibility" | "next_step" | "read" | "stop" | "replay" | "home" | "unknown",
  "actionDetails": {
    "type": "NAVIGATE" | "OPEN_URL" | "EVALUATE_ELIGIBILITY" | "READ_PAGE" | "STOP_AUDIO" | "REPLAY_AUDIO",
    "target": "scheme" | "documents" | "location" | "home" | "result",
    "url": "https://www.pmuy.gov.in/",
    "message": "Action summary"
  },
  "reply": "A thorough, complete spoken explanation in the detected native language. It must include complete procedure details, numbered steps with explanations, eligibility conditions, required documents, and important notices. Do not truncate or limit to brief summaries, as this full text will be read aloud to the user."
}`;

/**
 * Execute Gemini model call with automatic fallback and strict timeout
 */
async function callGeminiVoice(ai: GoogleGenAI, parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>) {
  // Prioritize gemini-3.1-flash-lite for fast response and reliability; fallback to gemini-3.8-flash
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: parts as any }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out after 18 seconds')), 18000)
        ),
      ]);

      const raw = response.text || '';
      try {
        const parsed = JSON.parse(cleanJson(raw));
        let lang = (parsed.language || 'en').toLowerCase().trim();
        // Normalize language name if returned in full text
        if (lang.includes('tam') || lang.includes('தமிழ்')) lang = 'ta';
        else if (lang.includes('tel') || lang.includes('తెలుగు')) lang = 'te';
        else if (lang.includes('hin') || lang.includes('हिन्दी')) lang = 'hi';
        else if (lang.includes('kan') || lang.includes('ಕನ್ನಡ')) lang = 'kn';
        else if (lang.includes('mal') || lang.includes('മലയാളം')) lang = 'ml';
        else if (lang.includes('ben') || lang.includes('বাংলা')) lang = 'bn';
        else if (lang.includes('mar') || lang.includes('मराठी')) lang = 'mr';
        else if (lang.includes('guj') || lang.includes('ગુજરાતી')) lang = 'gu';
        else if (lang.includes('pun') || lang.includes('ਪੰਜਾਬੀ')) lang = 'pa';
        else if (lang.includes('urd') || lang.includes('اردو')) lang = 'ur';
        else if (lang.includes('odi') || lang.includes('ଓଡ଼ିଆ')) lang = 'or';
        else if (lang.includes('ass') || lang.includes('অসমীয়া')) lang = 'as';
        else if (lang.includes('spa') || lang.includes('español')) lang = 'es';
        else if (lang.includes('fre') || lang.includes('français')) lang = 'fr';
        else if (lang.includes('ger') || lang.includes('deutsch')) lang = 'de';
        else if (lang.includes('ara') || lang.includes('العربية')) lang = 'ar';
        else if (lang.includes('chi') || lang.includes('中文')) lang = 'zh';
        else if (lang.includes('jap') || lang.includes('日本語')) lang = 'ja';
        else if (lang.includes('kor') || lang.includes('한국어')) lang = 'ko';
        else if (lang.includes('por') || lang.includes('português')) lang = 'pt';
        else if (lang.includes('rus') || lang.includes('русский')) lang = 'ru';
        else if (lang.includes('ita') || lang.includes('italiano')) lang = 'it';
        else if (lang.includes('dut') || lang.includes('nederlands')) lang = 'nl';
        else if (lang.includes('ind') || lang.includes('indonesia')) lang = 'id';
        else if (lang.includes('melayu')) lang = 'ms';
        else if (lang.includes('tha') || lang.includes('ไทย')) lang = 'th';
        else if (lang.includes('vie') || lang.includes('tiếng việt')) lang = 'vi';
        else if (lang.includes('tur') || lang.includes('türkçe')) lang = 'tr';
        else if (lang.includes('swa') || lang.includes('kiswahili')) lang = 'sw';
        else if (lang.includes('nep') || lang.includes('नेपाली')) lang = 'ne';
        else if (lang.includes('sin') || lang.includes('සිංහල')) lang = 'si';
        else if (lang.includes('-')) lang = lang.split('-')[0];

        let action: AllowedAction = parsed.action?.toLowerCase();
        if (!ALLOWED_ACTIONS.includes(action)) {
          action = 'unknown';
        }

        let actionDetails = parsed.actionDetails || null;
        if (!actionDetails) {
          if (action === 'scheme') {
            actionDetails = { type: 'NAVIGATE', target: 'scheme', message: 'Navigating to Scheme details' };
          } else if (action === 'documents') {
            actionDetails = { type: 'NAVIGATE', target: 'documents', message: 'Opening Required Documents' };
          } else if (action === 'location') {
            actionDetails = { type: 'NAVIGATE', target: 'location', message: 'Locating nearby Citizen Service Centers' };
          } else if (action === 'official_website') {
            actionDetails = { type: 'OPEN_URL', url: 'https://www.pmuy.gov.in/', message: 'Opening Official PMUY Portal' };
          } else if (action === 'check_eligibility') {
            actionDetails = { type: 'EVALUATE_ELIGIBILITY', target: 'scheme', message: 'Evaluating eligibility criteria' };
          } else if (action === 'next_step') {
            actionDetails = { type: 'NAVIGATE', target: 'scheme', message: 'Explaining next procedure step' };
          } else if (action === 'read') {
            actionDetails = { type: 'READ_PAGE', message: 'Reading page aloud' };
          } else if (action === 'stop') {
            actionDetails = { type: 'STOP_AUDIO', message: 'Stopping audio playback' };
          } else if (action === 'replay') {
            actionDetails = { type: 'REPLAY_AUDIO', message: 'Replaying audio speech' };
          } else if (action === 'home') {
            actionDetails = { type: 'NAVIGATE', target: 'home', message: 'Returning to Home' };
          } else {
            actionDetails = { type: 'NAVIGATE', target: 'result', message: 'Showing conversational response' };
          }
        }

        return {
          success: true,
          language: lang,
          languageName: parsed.languageName || '',
          nativeName: parsed.nativeName || '',
          transcript: parsed.transcript || '',
          action,
          actionDetails,
          reply: parsed.reply || '',
          modelUsed: model,
        };
      } catch (parseErr) {
        return {
          success: true,
          language: 'en' as const,
          transcript: raw.trim(),
          action: 'unknown' as const,
          actionDetails: { type: 'NAVIGATE', target: 'result', message: 'Showing response' },
          reply: raw.trim(),
          modelUsed: model,
        };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} failed: ${err.message}. Trying next fallback...`);
    }
  }

  throw lastError || new Error('All Gemini models failed to respond.');
}

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({
    status: 'ok',
    appName: 'SAHAYAK AI',
    apiKeyConfigured: hasKey,
    supportedLanguages: SUPPORTED_LANGUAGES,
  });
});

// Voice audio recognition endpoint
app.post('/api/voice', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please set GEMINI_API_KEY in your AI Studio secrets.',
        recoverable: true,
      });
    }

    let buffer: Buffer | null = null;
    let mimeType = 'audio/webm';

    if (req.file) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype || 'audio/webm';
    } else if (req.body?.audioBase64) {
      const rawBase64 = req.body.audioBase64.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(rawBase64, 'base64');
      mimeType = req.body.mimeType || 'audio/webm';
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({
        error: 'No audio was received. Please record again and tap Stop.',
      });
    }

    let historyContext = '';
    let parsedHistory: any = null;
    if (req.body?.history) {
      try {
        parsedHistory = typeof req.body.history === 'string' ? JSON.parse(req.body.history) : req.body.history;
      } catch (e) {}
    }
    if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
      historyContext = `\nRecent Conversation History:\n${parsedHistory.slice(-6).map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text || h.content}`).join('\n')}\nTake this conversation context into account for understanding follow-up instructions, next steps, and references.\n`;
    }

    const parts = [
      { text: `${PROMPT_INSTRUCTIONS}${historyContext}` },
      {
        inlineData: {
          mimeType,
          data: buffer.toString('base64'),
        },
      },
    ];

    const result = await callGeminiVoice(ai, parts);
    return res.json(result);
  } catch (err: any) {
    console.error('Error in /api/voice:', err);
    const message = err?.message || 'Voice recognition failed.';
    const isOverloaded = message.includes('503') || message.includes('high demand') || message.includes('429');
    
    return res.status(isOverloaded ? 503 : 500).json({
      error: isOverloaded
        ? 'The AI speech service is temporarily experiencing high demand. Please try speaking again in a few moments.'
        : `Voice processing error: ${message}`,
      details: message,
    });
  }
});

// Text & Simulation endpoint for instant testing across all supported languages
app.post('/api/test-voice', async (req: Request, res: Response) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured.',
      });
    }

    const { text, forceLang, history } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text query is required.' });
    }

    let historyContext = '';
    if (Array.isArray(history) && history.length > 0) {
      historyContext = `\nRecent Conversation History:\n${history.slice(-6).map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text || h.content}`).join('\n')}\nTake this conversation context into account for follow-up questions, next steps, and references.\n`;
    }

    const parts = [
      {
        text: `${PROMPT_INSTRUCTIONS}${historyContext}
${forceLang ? `The user requested language: ${forceLang}.` : ''}
Input to evaluate: "${text}"`,
      },
    ];

    const result = await callGeminiVoice(ai, parts);
    return res.json(result);
  } catch (err: any) {
    console.error('Error in /api/test-voice:', err);
    return res.status(500).json({
      error: err?.message || 'Testing command failed.',
    });
  }
});

// Setup Vite Dev Server or Production Static Files
async function main() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SAHAYAK AI] Server running at http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

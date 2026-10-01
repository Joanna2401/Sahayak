/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Multilingual Text-to-Speech Engine
 * Features:
 * - Natural sentence & clause chunking across all world scripts (Latin, Indic, Arabic, CJK, Cyrillic)
 * - Scalable multi-tier voice selection with BCP-47 fallback
 * - Chrome 15-second timeout keep-alive guard
 * - Play, Pause, Resume, Stop, and Replay controls
 * - Native voice availability detection & fallback notification
 */

export interface VoiceSelectionResult {
  voice: SpeechSynthesisVoice | null;
  isNative: boolean;
  voiceName: string;
  langUsed: string;
  nativeLanguageName: string;
}

export interface TTSState {
  status: 'idle' | 'playing' | 'paused' | 'stopped';
  currentText: string;
  currentLang: string;
  chunks: string[];
  currentChunkIndex: number;
  currentChunkText: string;
  voiceInfo: VoiceSelectionResult | null;
  progressPercent: number;
}

// Language dialect preferences
const LOCALE_MAP: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
  ur: 'ur-IN',
  or: 'or-IN',
  as: 'as-IN',
  ne: 'ne-NP',
  si: 'si-LK',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  ar: 'ar-SA',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  pt: 'pt-BR',
  ru: 'ru-RU',
  it: 'it-IT',
  nl: 'nl-NL',
  id: 'id-ID',
  ms: 'ms-MY',
  th: 'th-TH',
  vi: 'vi-VN',
  tr: 'tr-TR',
  sw: 'sw-KE',
};

const LANG_NAMES: Record<string, { name: string; native: string }> = {
  en: { name: 'English', native: 'English' },
  hi: { name: 'Hindi', native: 'हिन्दी' },
  ta: { name: 'Tamil', native: 'தமிழ்' },
  te: { name: 'Telugu', native: 'తెలుగు' },
  kn: { name: 'Kannada', native: 'ಕನ್ನಡ' },
  ml: { name: 'Malayalam', native: 'മലയാളം' },
  bn: { name: 'Bengali', native: 'বাংলা' },
  mr: { name: 'Marathi', native: 'मराठी' },
  gu: { name: 'Gujarati', native: 'ગુજરાતી' },
  pa: { name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  ur: { name: 'Urdu', native: 'اردو' },
  or: { name: 'Odia', native: 'ଓଡ଼ିଆ' },
  as: { name: 'Assamese', native: 'অসমীয়া' },
  ne: { name: 'Nepali', native: 'नेपाली' },
  si: { name: 'Sinhala', native: 'සිංහල' },
  es: { name: 'Spanish', native: 'Español' },
  fr: { name: 'French', native: 'Français' },
  de: { name: 'German', native: 'Deutsch' },
  ar: { name: 'Arabic', native: 'العربية' },
  zh: { name: 'Chinese', native: '中文' },
  ja: { name: 'Japanese', native: '日本語' },
  ko: { name: 'Korean', native: '한국어' },
  pt: { name: 'Portuguese', native: 'Português' },
  ru: { name: 'Russian', native: 'Русский' },
  it: { name: 'Italian', native: 'Italiano' },
  nl: { name: 'Dutch', native: 'Nederlands' },
  id: { name: 'Indonesian', native: 'Bahasa Indonesia' },
  ms: { name: 'Malay', native: 'Bahasa Melayu' },
  th: { name: 'Thai', native: 'ไทย' },
  vi: { name: 'Vietnamese', native: 'Tiếng Việt' },
  tr: { name: 'Turkish', native: 'Türkçe' },
  sw: { name: 'Swahili', native: 'Kiswahili' },
};

/**
 * Split long text into natural, complete sentence and clause chunks.
 * Handles Devanagari purna viram (।), Arabic question/period, CJK full stops (。),
 * Latin punctuation (.!?), and newlines. Never truncates or drops words.
 */
export function splitIntoSpeechChunks(text: string, maxChunkLength: number = 160): string[] {
  if (!text || !text.trim()) return [];

  // Remove markdown formatting but keep the wording
  let cleanText = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~]/g, '')
    .trim();

  // Split on sentence boundaries across Indic, Arabic, CJK, and Western punctuation
  const sentenceRegex = /([^.!?।\n;؛。၊]+[.!?।\n;؛。၊]+|[^.!?।\n;؛。၊]+$)/g;
  const rawSentences = cleanText.match(sentenceRegex) || [cleanText];

  const chunks: string[] = [];

  for (const raw of rawSentences) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // If sentence is within comfortable length, keep intact
    if (trimmed.length <= maxChunkLength) {
      chunks.push(trimmed);
      continue;
    }

    // If sentence is unusually long, split on clauses (commas, dashes, or conjunctions)
    const clauseRegex = /([^,،:—–-]+[,،:—–-]+|[^,،:—–-]+$)/g;
    const subClauses = trimmed.match(clauseRegex) || [trimmed];
    let buffer = '';

    for (const sub of subClauses) {
      const subTrimmed = sub.trim();
      if (!subTrimmed) continue;

      if ((buffer + ' ' + subTrimmed).trim().length <= maxChunkLength) {
        buffer = buffer ? `${buffer} ${subTrimmed}` : subTrimmed;
      } else {
        if (buffer) chunks.push(buffer);
        buffer = subTrimmed;
      }
    }
    if (buffer) {
      chunks.push(buffer);
    }
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Scalable Language-to-Voice Selection mechanism
 * Multi-tier matching:
 * 1. Exact locale (e.g. 'ta-IN')
 * 2. Prefix match (e.g. 'ta')
 * 3. English or Native language name in voice name
 * 4. Graceful fallback with clear flag
 */
export function selectVoiceForLanguage(langCode: string): VoiceSelectionResult {
  const baseCode = (langCode || 'en').split('-')[0].toLowerCase();
  const preferredLocale = (LOCALE_MAP[baseCode] || `${baseCode}-IN`).toLowerCase();
  const langMeta = LANG_NAMES[baseCode] || { name: baseCode.toUpperCase(), native: baseCode.toUpperCase() };

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return {
      voice: null,
      isNative: false,
      voiceName: 'Unavailable',
      langUsed: preferredLocale,
      nativeLanguageName: langMeta.native,
    };
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    return {
      voice: null,
      isNative: false,
      voiceName: 'Default System Voice',
      langUsed: preferredLocale,
      nativeLanguageName: langMeta.native,
    };
  }

  // Tier 1: Exact preferred locale match (e.g. ta-IN, hi-IN, fr-FR)
  let matched = voices.find((v) => v.lang.toLowerCase().replace('_', '-') === preferredLocale);

  // Tier 2: Base language code prefix match (e.g. starts with 'ta-', 'ta_')
  if (!matched) {
    matched = voices.find((v) => {
      const vLang = v.lang.toLowerCase().replace('_', '-');
      return vLang === baseCode || vLang.startsWith(`${baseCode}-`) || vLang.startsWith(`${baseCode}_`);
    });
  }

  // Tier 3: Voice name contains English or native language name
  if (!matched) {
    matched = voices.find((v) => {
      const nameLower = v.name.toLowerCase();
      return (
        nameLower.includes(langMeta.name.toLowerCase()) ||
        nameLower.includes(langMeta.native.toLowerCase())
      );
    });
  }

  if (matched) {
    return {
      voice: matched,
      isNative: true,
      voiceName: matched.name,
      langUsed: matched.lang,
      nativeLanguageName: langMeta.native,
    };
  }

  // Tier 4: Fallback to best available system voice (with clear fallback flag)
  const fallbackVoice = voices.find((v) => v.default) || voices[0];
  return {
    voice: fallbackVoice,
    isNative: false,
    voiceName: fallbackVoice?.name || 'Default System Voice',
    langUsed: preferredLocale,
    nativeLanguageName: langMeta.native,
  };
}

/**
 * Singleton Audio Speech Controller with Event Callbacks
 */
class TTSEngine {
  private queue: string[] = [];
  private currentIndex: number = 0;
  private currentLang: string = 'en';
  private currentFullText: string = '';
  private isPaused: boolean = false;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private keepAliveTimer: any = null;
  private stateChangeCallback: ((state: TTSState) => void) | null = null;
  private currentVoiceInfo: VoiceSelectionResult | null = null;
  private onCompleteCallback: (() => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        // Voices loaded/updated by browser
        if (this.currentLang && this.queue.length > 0) {
          this.currentVoiceInfo = selectVoiceForLanguage(this.currentLang);
          this.notifyState();
        }
      };
    }
  }

  public subscribe(cb: (state: TTSState) => void) {
    this.stateChangeCallback = cb;
    this.notifyState();
  }

  public onSpeechComplete(cb: (() => void) | null) {
    this.onCompleteCallback = cb;
  }

  public getState(): TTSState {
    const isPlaying =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      window.speechSynthesis.speaking &&
      !this.isPaused;

    const total = this.queue.length || 1;
    const progress = Math.min(100, Math.round(((this.currentIndex + 1) / total) * 100));

    return {
      status: this.isPaused
        ? 'paused'
        : isPlaying
        ? 'playing'
        : this.queue.length > 0 && this.currentIndex >= this.queue.length
        ? 'stopped'
        : 'idle',
      currentText: this.currentFullText,
      currentLang: this.currentLang,
      chunks: this.queue,
      currentChunkIndex: this.currentIndex,
      currentChunkText: this.queue[this.currentIndex] || '',
      voiceInfo: this.currentVoiceInfo,
      progressPercent: progress,
    };
  }

  private notifyState() {
    if (this.stateChangeCallback) {
      this.stateChangeCallback(this.getState());
    }
  }

  /**
   * Speak full text in specified language without truncation
   */
  public speakFullText(text: string, langCode: string, onComplete?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis is not supported in this browser.');
      return;
    }

    this.stop(); // Stop any currently active speech

    if (!text || !text.trim()) return;

    this.currentFullText = text;
    this.currentLang = langCode;
    this.queue = splitIntoSpeechChunks(text);
    this.currentIndex = 0;
    this.isPaused = false;
    this.currentVoiceInfo = selectVoiceForLanguage(langCode);
    if (onComplete) {
      this.onCompleteCallback = onComplete;
    }

    if (this.queue.length === 0) return;

    this.startKeepAlive();
    this.speakCurrentChunk();
  }

  private speakCurrentChunk() {
    if (this.currentIndex >= this.queue.length) {
      this.stopKeepAlive();
      this.notifyState();
      if (this.onCompleteCallback) {
        const cb = this.onCompleteCallback;
        // Don't wipe if recurring, but call it
        setTimeout(() => cb(), 250);
      }
      return;
    }

    const chunkText = this.queue[this.currentIndex];
    const utterance = new SpeechSynthesisUtterance(chunkText);
    this.activeUtterance = utterance;

    const voiceInfo = this.currentVoiceInfo || selectVoiceForLanguage(this.currentLang);
    utterance.lang = voiceInfo.langUsed || 'en-IN';
    if (voiceInfo.voice) {
      utterance.voice = voiceInfo.voice;
    }
    utterance.rate = 0.92; // Natural, articulate cadence

    utterance.onstart = () => {
      this.isPaused = false;
      this.notifyState();
    };

    utterance.onend = () => {
      this.currentIndex++;
      this.speakCurrentChunk();
    };

    utterance.onerror = (event) => {
      // Ignore normal user cancellations
      if (event.error === 'canceled' || event.error === 'interrupted') {
        return;
      }
      console.warn('TTS chunk error:', event.error, 'Moving to next sentence...');
      this.currentIndex++;
      this.speakCurrentChunk();
    };

    window.speechSynthesis.speak(utterance);
    this.notifyState();
  }

  /**
   * Chrome 15s keep-alive watchdog
   */
  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        window.speechSynthesis.speaking &&
        !this.isPaused
      ) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 8000);
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  public pause() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
      this.isPaused = true;
      this.notifyState();
    }
  }

  public resume() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      this.isPaused = false;
      this.notifyState();
    }
  }

  public stop() {
    this.stopKeepAlive();
    this.isPaused = false;
    this.activeUtterance = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.notifyState();
  }

  public replay() {
    if (this.currentFullText) {
      this.speakFullText(this.currentFullText, this.currentLang);
    }
  }
}

export const ttsEngine = new TTSEngine();

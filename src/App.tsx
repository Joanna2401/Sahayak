/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ArrowLeft,
  Building2,
  FileText,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Info,
  Check,
  Play,
  Pause,
  Square,
} from 'lucide-react';
import {
  LANGUAGES,
  TRANSLATIONS,
  getTranslationsForLang,
  LanguageCode,
  PageTranslations,
} from './translations';
import { ttsEngine, TTSState } from './ttsEngine';

type ActivePage = 'home' | 'scheme' | 'documents' | 'location' | 'result';

interface VoiceResultData {
  language: string;
  languageName?: string;
  nativeName?: string;
  transcript: string;
  action: string;
  actionDetails?: {
    type: string;
    target?: string;
    url?: string;
    message?: string;
  };
  reply: string;
  modelUsed?: string;
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  // Requirement 1: Opens in English
  const [currentLang, setCurrentLang] = useState<string>('en');
  const [activePage, setActivePage] = useState<ActivePage>('home');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [transcript, setTranscript] = useState<string>('');
  const [lastReply, setLastReply] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastAction, setLastAction] = useState<string>('');
  const [langTab, setLangTab] = useState<'all' | 'indian' | 'global'>('all');

  // Continuous Voice Assistant Mode & Conversation Context
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const continuousModeRef = useRef<boolean>(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Location state
  const [locationStatus, setLocationStatus] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Eligibility check state in scheme page
  const [eligibilityAnswers, setEligibilityAnswers] = useState({
    adultWoman: true,
    noCurrentConnection: true,
    hasBankAcc: true,
  });
  const [eligibilityResult, setEligibilityResult] = useState<string | null>(null);

  // Documents checklist
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({
    doc1: false,
    doc2: false,
    doc3: false,
    doc4: false,
    doc5: false,
  });

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  const t: PageTranslations = getTranslationsForLang(currentLang);
  const currentLangInfo = LANGUAGES[currentLang] || {
    code: currentLang,
    name: currentLang.toUpperCase(),
    nativeName: currentLang.toUpperCase(),
    voiceLang: `${currentLang}-IN`,
    flag: '🌐',
    samplePhrase: '',
  };

  // TTS state subscription
  const [ttsState, setTtsState] = useState<TTSState>(ttsEngine.getState());

  useEffect(() => {
    ttsEngine.subscribe((state) => {
      setTtsState(state);
      setIsSpeaking(state.status === 'playing');
    });
    return () => {
      ttsEngine.stop();
    };
  }, []);

  // Initialize status message when language changes if not recording/processing
  useEffect(() => {
    if (!isRecording && !isProcessing) {
      setStatusMessage(t.micPromptIdle);
    }
  }, [currentLang, t.micPromptIdle]);

  // Clean up speech synthesis and audio on unmount
  useEffect(() => {
    return () => {
      ttsEngine.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((trk) => trk.stop());
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Speak complete text in the target language voice with sentence chunking & no truncation
   */
  const speak = (textToSpeak: string, langCode: string = currentLang) => {
    ttsEngine.speakFullText(textToSpeak, langCode);
  };

  const pauseSpeaking = () => {
    ttsEngine.pause();
  };

  const resumeSpeaking = () => {
    ttsEngine.resume();
  };

  const stopSpeaking = () => {
    ttsEngine.stop();
  };

  const replaySpeaking = () => {
    ttsEngine.replay();
  };

  /**
   * Read the active page content aloud completely without omitting steps, descriptions, or notices
   */
  const readCurrentPage = () => {
    stopSpeaking();
    let text = '';
    if (activePage === 'home') {
      text = `${t.homeTitle}. ${t.homeSub}. ${t.btnScheme}. ${t.btnDocuments}. ${t.btnLocation}.`;
    } else if (activePage === 'scheme') {
      text = `${t.schemeTitle}. ${t.schemeDesc}. ${t.schemeNotice}. ${t.schemeStep1Title}: ${t.schemeStep1Desc}. ${t.schemeStep2Title}: ${t.schemeStep2Desc}. ${t.schemeStep3Title}: ${t.schemeStep3Desc}. ${t.eligibilityTitle}: ${t.eligibilityDesc}. ${t.schemeOfficialBtn} at pmuy.gov.in.`;
    } else if (activePage === 'documents') {
      text = `${t.docsTitle}. ${t.docsDesc}. ${t.docItem1Title}: ${t.docItem1Desc}. ${t.docItem2Title}: ${t.docItem2Desc}. ${t.docItem3Title}: ${t.docItem3Desc}. ${t.docItem4Title}: ${t.docItem4Desc}. ${t.docItem5Title}: ${t.docItem5Desc}. ${t.checklistNotice}`;
    } else if (activePage === 'location') {
      text = `${t.locTitle}. ${t.locDesc}. ${t.nearbyCentersTitle}. ${t.center1Title}: ${t.center1Desc}. ${t.center2Title}: ${t.center2Desc}. ${t.center3Title}: ${t.center3Desc}`;
    } else if (activePage === 'result') {
      text = `${t.resultTitle}. ${lastReply}`;
    }

    speak(text, currentLang);
  };

  // Sync continuousMode ref and hook speech completion for continuous auto-listen
  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  useEffect(() => {
    ttsEngine.onSpeechComplete(() => {
      if (continuousModeRef.current) {
        setStatusMessage('🎙️ Assistant is ready. Listening for your next instruction...');
        setTimeout(() => {
          if (continuousModeRef.current && !isRecordingRef.current && !isProcessingRef.current) {
            startRecording();
          }
        }, 600);
      }
    });
  }, []);

  /**
   * Process and execute voice command payload
   */
  const handleVoiceResponse = (data: VoiceResultData) => {
    // 1. Detect and change UI language
    if (data.language) {
      setCurrentLang(data.language);
      document.documentElement.lang = data.language;
    }

    // 2. Set transcripts and responses
    setTranscript(data.transcript || '');
    setLastReply(data.reply || '');
    setLastAction(data.action);
    const langDisplay =
      data.nativeName ||
      LANGUAGES[data.language]?.nativeName ||
      LANGUAGES[data.language]?.name ||
      data.language;
    setStatusMessage(`✓ ${langDisplay} detected`);

    // 3. Save multi-turn conversation history for context
    setConversationHistory((prev) => [
      ...prev.slice(-6),
      { role: 'user', content: data.transcript || '' },
      { role: 'assistant', content: data.reply || '' },
    ]);

    // 4. Handle immediate voice commands like Stop and Replay
    if (data.action === 'stop') {
      stopSpeaking();
      setStatusMessage('⏹ Audio stopped as instructed.');
      return;
    }

    if (data.action === 'replay') {
      replaySpeaking();
      return;
    }

    // 5. Speak the full reply in the detected language
    if (data.reply) {
      speak(data.reply, data.language);
    }

    // 6. Execute the real requested action
    setTimeout(() => {
      const act = data.action;
      const details = data.actionDetails;

      if (act === 'official_website' || details?.type === 'OPEN_URL') {
        const targetUrl = details?.url || 'https://www.pmuy.gov.in/';
        setActionNotice(`✓ Official Portal ready: ${targetUrl}`);
        setActivePage('scheme');
        return;
      }

      if (act === 'check_eligibility' || details?.type === 'EVALUATE_ELIGIBILITY') {
        setActivePage('scheme');
        evaluateEligibility();
        setActionNotice('✓ Evaluated official eligibility criteria.');
        return;
      }

      if (act === 'scheme') {
        setActivePage('scheme');
        setActionNotice('✓ Navigated to Pradhan Mantri Ujjwala Yojana (PMUY) service guide.');
      } else if (act === 'documents') {
        setActivePage('documents');
        setActionNotice('✓ Opened Required Documents verification checklist.');
      } else if (act === 'location') {
        setActivePage('location');
        requestLocation();
        setActionNotice('✓ Locating nearby Citizen Service Centers & CSC points.');
      } else if (act === 'next_step') {
        setActivePage('scheme');
        setActionNotice('✓ Showing next step in government application procedure.');
      } else if (act === 'read') {
        readCurrentPage();
      } else if (act === 'home') {
        setActivePage('home');
      } else {
        setActivePage('result');
      }
    }, 500);
  };

  /**
   * Record microphone audio
   */
  const startRecording = async () => {
    setErrorMessage(null);
    stopSpeaking();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Determine supported mimeType
      const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
      let selectedMimeType = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      const recorder = new MediaRecorder(
        stream,
        selectedMimeType ? { mimeType: selectedMimeType } : undefined
      );

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        setIsProcessing(true);
        setStatusMessage(t.micPromptProcessing);

        // Stop all tracks to release mic hardware
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((trk) => trk.stop());
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: selectedMimeType || 'audio/webm',
        });

        await sendAudioToServer(audioBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setStatusMessage(t.micPromptListening);
    } catch (err: any) {
      console.error('Microphone error:', err);
      setIsRecording(false);
      setIsProcessing(false);
      setErrorMessage(t.errorMicPermission);
      setStatusMessage(t.micPromptIdle);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleRecording = () => {
    stopSpeaking(); // Instantly interrupt any playing speech
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  /**
   * Send recorded audio to backend /api/voice with timeout and graceful error recovery
   */
  const sendAudioToServer = async (blob: Blob) => {
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');
    formData.append('history', JSON.stringify(conversationHistory));

    // 16s AbortController timeout to guarantee no indefinite hanging
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 16000);

    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server voice processing error');
      }

      handleVoiceResponse(data);
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Audio upload error:', err);

      let msg = t.errorApiUnavailable;
      if (err.name === 'AbortError') {
        msg = t.errorApiTimeout;
      } else if (err.message) {
        msg = `${err.message}`;
      }

      setErrorMessage(msg);
      setStatusMessage(t.micPromptIdle);
      setTranscript('Processing was interrupted. Please try again or use the test buttons below.');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Test simulated speech in any specific language (worldwide multilingual support)
   */
  const handleTestLanguage = async (lang: string, customPhrase?: string) => {
    setErrorMessage(null);
    stopSpeaking();
    setIsProcessing(true);
    const langObj = LANGUAGES[lang] || {
      code: lang,
      name: lang.toUpperCase(),
      nativeName: lang.toUpperCase(),
      voiceLang: `${lang}-IN`,
      flag: '🌐',
      samplePhrase: 'I need government assistance',
    };
    setStatusMessage(`Testing ${langObj.name} (${langObj.nativeName}) voice recognition...`);

    const phrase = customPhrase || langObj.samplePhrase;
    setTranscript(`"${phrase}"`);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 16000);

    try {
      const response = await fetch('/api/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: phrase,
          forceLang: lang,
          history: conversationHistory,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Test failed');
      }

      handleVoiceResponse(data);
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Test voice error:', err);
      setErrorMessage(
        err.name === 'AbortError'
          ? t.errorApiTimeout
          : `${err.message || 'Service unavailable. Please retry.'}`
      );
      setStatusMessage(t.micPromptIdle);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Geolocation Handler
   */
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus('granted');
        speak(t.locGranted, currentLang);
      },
      (err) => {
        console.warn('Location error:', err);
        setLocationStatus('denied');
        speak(t.locDenied, currentLang);
      }
    );
  };

  /**
   * Complete multilingual voice greetings and eligibility evaluations
   */
  const getContinuousModeGreeting = (lang: string) => {
    const greetings: Record<string, string> = {
      en: 'Voice Assistant Mode is active. I am ready and listening for your command.',
      hi: 'सतत वॉयस मोड सक्रिय है। मैं आपका निर्देश सुनने के लिए तैयार हूँ।',
      ta: 'தொடர் குரல் உதவியாளர் பயன்முறை இயக்கப்பட்டது. நான் உங்கள் கட்டளையை கேட்கிறேன்.',
      te: 'వాయిస్ అసిస్టెంట్ మోడ్ ప్రారంభమైంది. నేను మీ ఆదేశాన్ని వింటున్నాను.',
      kn: 'ಧ್ವನಿ ಸಹಾಯಕ ಮೋಡ್ ಸಕ್ರಿಯವಾಗಿದೆ. ನಿಮ್ಮ ಸೂಚನೆಯನ್ನು ಕೇಳಲು ಸಿದ್ಧನಾಗಿದ್ದೇನೆ.',
      ml: 'വോയ്‌സ് അസിസ്റ്റന്റ് മോഡ് സജീവമാണ്. നിങ്ങളുടെ നിർദ്ദേശം കേൾക്കാൻ തയ്യാറാണ്.',
      bn: 'ভয়েস সহকারী মোড সক্রিয়। আমি আপনার নির্দেশ শোনার জন্য প্রস্তুত।',
      mr: 'व्हॉइस असिस्टंट मोड सक्रिय आहे. मी तुमच्या सूचना ऐकण्यासाठी तयार आहे.',
      gu: 'વૉઇસ સહાયક મોડ સક્રિય છે. હું તમારી સૂચના સાંભળવા માટે તૈયાર છું.',
      pa: 'ਵਾਇਸ ਸਹਾਇਕ ਮੋਡ ਸਰਗਰਮ ਹੈ। ਮੈਂ ਤੁਹਾਡਾ ਹੁਕਮ ਸੁਣਨ ਲਈ ਤਿਆਰ ਹਾਂ।',
      ur: 'وائس اسسٹنٹ موڈ فعال ہے۔ میں آپ کی ہدایت سننے کے لیے تیار ہوں۔',
      or: 'ଭଏସ୍ ସହାୟକ ମୋଡ୍ ସକ୍ରିୟ ଅଛି। ମୁଁ ଆପଣଙ୍କ ନିର୍ଦ୍ଦେଶ ଶୁଣିବା ପାଇଁ ପ୍ରସ୍ତୁତ।',
      as: 'ভয়চ সহায়ক ম’ড সক্ৰিয় হৈছে। মই আপোনাৰ নিৰ্দেশনা শুনিবলৈ সাজু।',
      es: 'Modo de asistente de voz activo. Estoy listo para escuchar sus instrucciones.',
      fr: 'Mode assistant vocal activé. Je suis prêt à écouter vos instructions.',
      de: 'Sprachassistentenmodus aktiv. Ich bin bereit für Ihre Anweisung.',
      ar: 'وضع المساعد الصوتي نشط. أنا جاهز للاستماع إلى تعليماتك.',
      zh: '语音助手模式已启动。我随时准备聆听您的指令。',
      ja: '音声アシスタントモードが有効です。ご指示をお待ちしています。',
      ko: '음성 어시스턴트 모드가 활성화되었습니다. 지시를 들을 준비가 되었습니다.',
      pt: 'Modo de assistente de voz ativo. Estou pronto para ouvir suas instruções.',
      ru: 'Голосовой помощник активен. Я готов слушать ваши инструкции.',
      it: 'Modalità assistente vocale attiva. Sono pronto ad ascoltare le tue istruzioni.',
      nl: 'Spraakassistentmodus is actief. Ik luister naar uw instructie.',
      id: 'Mode asisten suara aktif. Saya siap mendengarkan instruksi Anda.',
      ms: 'Mod pembantu suara aktif. Saya sedia mendengar arahan anda.',
      th: 'โหมดผู้ช่วยเสียงทำงานแล้ว พร้อมรับฟังคำสั่งของคุณ',
      vi: 'Chế độ trợ lý giọng nói đang hoạt động. Tôi đã sẵn sàng lắng nghe hướng dẫn của bạn.',
      tr: 'Sesli asistan modu aktif. Talimatınızı dinlemeye hazırım.',
      sw: 'Hali ya msaidizi wa sauti inafanya kazi. Niko tayari kusikiliza maagizo yako.',
      ne: 'आवाज सहायक मोड सक्रिय छ। म तपाईंको निर्देशन सुन्न तयार छु।',
      si: 'හඬ සහයක ප්‍රකාරය සක්‍රියයි. ඔබේ උපදෙස් වලට සවන් දීමට මම සූදානම්.',
    };
    return greetings[lang] || greetings['en'];
  };

  const getEligibilityMessage = (lang: string, isEligible: boolean) => {
    if (isEligible) {
      const msgs: Record<string, string> = {
        en: 'Congratulations! Your family qualifies for the PM Ujjwala free LPG connection.',
        hi: 'बधाई हो! आपका परिवार उज्ज्वला योजना मुफ्त गैस कनेक्शन के लिए पात्र है।',
        ta: 'வாழ்த்துகள்! உங்கள் குடும்பம் உஜ்வாலா யோஜனா இலவச சிலிண்டர் திட்டத்திற்கு தகுதியுடையது.',
        te: 'అభినందనలు! మీ కుటుంబం ఉజ్జ్వల యోజన ఉచిత సిలిండర్ పథకానికి అర్హత కలిగి ఉంది.',
        kn: 'ಅಭಿನಂದನೆಗಳು! ನಿಮ್ಮ ಕುಟುಂಬವು ಉಚಿತ ಉಜ್ವಲ ಗ್ಯಾಸ್ ಸಂಪರ್ಕ ಯೋಜನೆಗೆ ಅರ್ಹವಾಗಿದೆ.',
        ml: 'അഭിനന്ദനങ്ങൾ! നിങ്ങളുടെ കുടുംബത്തിന് സൗജന്യ ಉജ്ജ്വല ഗ്യാസ് കണക്ഷന് അർഹതയുണ്ട്.',
        bn: 'অভিনন্দন! আপনার পরিবার প্রধানমন্ত্রী উজ্জ্বলা বিনামূল্যে এলপিজি গ্যাস সংযোগের জন্য যোগ্য।',
        mr: 'अभिनंदन! तुमचे कुटुंब पंतप्रधान उज्ज्वला मोफत गॅस जोडणीसाठी पात्र आहे.',
        gu: 'અભિનંદન! તમારો પરિવાર પીએમ ઉજ્જ્વલા મફત એલપીજી કનેક્શન માટે પાત્ર છે.',
        pa: 'ਮੁਬਾਰਕਾਂ! ਤੁਹਾਡਾ ਪਰਿਵਾਰ ਪ੍ਰਧਾਨ ਮੰਤਰੀ ਉੱਜਵਲਾ ਮੁਫ਼ਤ ਐਲਪੀਜੀ ਕਨੈਕਸ਼ਨ ਲਈ ਯੋਗ ਹੈ।',
        ur: 'مبارک ہو! آپ کا خاندان وزیر اعظم اجولا مفت گیس کنکشن کے لیے اہل ہے۔',
        or: 'ଅଭିନନ୍ଦନ! ଆପଣଙ୍କ ପରିବାର ପ୍ରଧାନମନ୍ତ୍ରୀ ଉଜ୍ଜ୍ୱଳା ମାଗଣା ଗ୍ୟାସ ସଂଯୋଗ ପାଇଁ ଯୋଗ୍ୟ।',
        as: 'অভিনন্দন! আপোনাৰ পৰিয়ালে প্ৰধানমন্ত্ৰী উজ্জ্বলা বিনামূলীয়া গেছ সংযোগৰ বাবে যোগ্য।',
        es: '¡Felicitaciones! Su familia califica para la conexión gratuita de gas de PM Ujjwala.',
        fr: 'Félicitations ! Votre famille est éligible au raccordement de gaz gratuit PM Ujjwala.',
        de: 'Herzlichen Glückwunsch! Ihre Familie qualifiziert sich für den kostenlosen Gasanschluss von PM Ujjwala.',
        ar: 'تهانينا! عائلتك مؤهلة للحصول على توصيلة غاز مجانية ضمن مبادرة أوجوالا.',
        zh: '恭喜！您的家庭符合申请免费液化石油气连接的条件。',
        ja: 'おめでとうございます！ご家族は無料のPMウジワラガス接続の対象となります。',
        ko: '축하합니다! 귀하의 가족은 무료 가스 연결 지원 대상입니다.',
        pt: 'Parabéns! Sua família se qualifica para a ligação gratuita de gás PM Ujjwala.',
        ru: 'Поздравляем! Ваша семья имеет право на бесплатное подключение газа по программе Уджвала.',
        it: 'Congratulazioni! La tua famiglia ha diritto all\'allacciamento gratuito del gas PM Ujjwala.',
        nl: 'Gefeliciteerd! Uw familie komt in aanmerking voor de gratis PM Ujjwala-gasaansluiting.',
        id: 'Selamat! Keluarga Anda memenuhi syarat untuk sambungan gas gratis PM Ujjwala.',
        ms: 'Tahniah! Keluarga anda layak mendapat sambungan gas percuma PM Ujjwala.',
        th: 'ยินดีด้วย! ครอบครัวของคุณมีสิทธิ์ได้รับการต่อถังก๊าซฟรีตามโครงการ',
        vi: 'Chúc mừng! Gia đình bạn đủ điều kiện nhận kết nối gas miễn phí theo chương trình.',
        tr: 'Tebrikler! Aileniz ücretsiz PM Ujjwala gaz bağlantısı için uygundur.',
        sw: 'Hongera! Familia yako inastahili muunganisho wa bure wa gesi wa PM Ujjwala.',
        ne: 'बधाई छ! तपाईंको परिवार उज्ज्वला योजना अन्तर्गत निःशुल्क ग्यास जडानको लागि योग्य छ।',
        si: 'සුබ පැතුම්! ඔබේ පවුල නොමිලේ ගෑස් සම්බන්ධතාවය සඳහා සුදුසුකම් ලබයි.',
      };
      return msgs[lang] || msgs['en'];
    } else {
      const msgs: Record<string, string> = {
        en: 'Eligibility criteria: Applicant must be an adult woman (18+) with no pre-existing LPG connection in the household.',
        hi: 'पात्रता शर्त: आवेदक महिला 18 वर्ष से अधिक हो और परिवार में पहले से कोई गैस कनेक्शन न हो।',
        ta: 'தகுதி நிபந்தனை: விண்ணப்பதாரர் 18+ பெண்ணாக இருக்க வேண்டும் மற்றும் குடும்பத்தில் வேறு எல்பிஜி இணைப்பு இருக்கக்கூடாது.',
        te: 'అర్హత షరతులు: దరఖాస్తుదారు 18+ మహిళ అయి ఉండాలి మరియు కుటుంబంలో ఇతర గ్యాస్ కనెక్షన్ ఉండకూడదు.',
        kn: 'ಅರ್ಹತಾ ಷರತ್ತು: ಅರ್ಜಿದಾರರು 18+ ಮಹಿಳೆಯಾಗಿರಬೇಕು ಮತ್ತು ಕುಟುಂಬದಲ್ಲಿ ಬೇರೆ ಯಾವುದೇ ಗ್ಯಾಸ್ ಸಂಪರ್ಕ ಇರಬಾರದು.',
        ml: 'യോഗ്യതാ മാനദണ്ഡം: അപേക്ഷക 18+ വനിതയായിരിക്കണം, കുടുംബത്തിൽ മറ്റ് ഗ്യാസ് കണക്ഷൻ ഉണ്ടാകരുത്.',
        bn: 'যোগ্যতার শর্ত: আবেদনকারীকে অবশ্যই ১৮+ প্রাপ্তবয়স্ক নারী হতে হবে এবং পরিবারে আগে থেকে কোনো এলপিজি সংযোগ থাকা চলবে না।',
        mr: 'पात्रता अटी: अर्जदार महिला १८ वर्षांपेक्षा जास्त वयाची असावी आणि कुटुंबात आधीपासून गॅस कनेक्शन नसावे.',
        gu: 'પાત્રતા માપદંડ: અરજદાર 18+ વયની મહિલા હોવી જોઈએ અને ઘરમાં અગાઉથી કોઈ ગેસ કનેક્શન ન હોવું જોઈએ.',
        pa: 'ਯੋਗਤਾ ਸ਼ਰਤਾਂ: ਬਿਨੈਕਾਰ 18+ ਔਰਤ ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ ਅਤੇ ਪਰਿਵਾਰ ਵਿੱਚ ਪਹਿਲਾਂ ਤੋਂ ਕੋਈ ਗੈਸ ਕਨੈਕਸ਼ਨ ਨਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ।',
        ur: 'اہلیت کے معیار: درخواست دہندہ 18+ خاتون ہونی چاہیے اور خاندان میں پہلے سے کوئی گیس کنکشن نہیں ہونا چاہیے۔',
        or: 'ଯୋଗ୍ୟତା ସର୍ତ୍ତ: ଆବେଦନକାରୀ ୧୮+ ବୟସର ମହିଳା ହୋଇଥିବା ଆବଶ୍ୟକ ଏବଂ ପରିବାରରେ କୌଣସି ପୂର୍ବ ଗ୍ୟାସ ସଂଯୋଗ ନଥିବା ଉଚିତ।',
        as: 'যোগ্যতাৰ চৰ্ত: আবেদনকাৰী ১৮+ মহিলা হ’ব লাগিব আৰু পৰিয়ালত পূৰ্বৰ কোনো গেছ সংযোগ থাকিব নালাগে।',
        es: 'Criterio de elegibilidad: La solicitante debe ser mujer mayor de 18 años sin conexión de gas previa en el hogar.',
        fr: 'Critères d\'éligibilité : La demandeuse doit être une femme majeure (18+) sans raccordement de gaz préexistant dans le foyer.',
        de: 'Zulassungskriterien: Die Antragstellerin muss eine volljährige Frau (18+) ohne bestehenden Gasanschluss im Haushalt sein.',
        ar: 'شروط الأهلية: يجب أن تكون مقدمة الطلب امرأة بالغة (18+) مع عدم وجود توصيلة غاز سابقة في الأسرة.',
        zh: '申请资格：申请人必须是成年女性（18岁以上），且家中此前未有任何燃气连接。',
        ja: '対象条件：申請者は18歳以上の成人女性であり、世帯内に既存のガス接続がないことが必要です。',
        ko: '신청 자격: 신청자는 18세 이상의 성인 여성으로 세대 내 기존 가스 연결이 없어야 합니다.',
        pt: 'Critérios de elegibilidade: A requerente deve ser mulher maior de 18 anos sem conexão de gás pré-existente no domicílio.',
        ru: 'Критерии: Заявитель должна быть совершеннолетней женщиной (18+), в домохозяйстве не должно быть действующего подключения к газу.',
        it: 'Criteri di ammissibilità: La richiedente deve essere una donna maggiorenne (18+) senza allacciamento al gas preesistente nel nucleo familiare.',
        nl: 'Voorwaarden: Aanvrager moet een meerderjarige vrouw (18+) zijn zonder bestaande gasaansluiting in het huishouden.',
        id: 'Kriteria kelayakan: Pemohon harus seorang wanita dewasa (18+) tanpa sambungan gas sebelumnya di rumah tangga.',
        ms: 'Kriteria kelayakan: Pemohon mestilah wanita dewasa (18+) tanpa sambungan gas sedia ada dalam isi rumah.',
        th: 'เกณฑ์คุณสมบัติ: ผู้สมัครต้องเป็นหญิงบรรลุนิติภาวะ (18+) และไม่มีการเชื่อมต่อก๊าซในครัวเรือนมาก่อน',
        vi: 'Điều kiện: Người nộp đơn phải là phụ nữ từ 18 tuổi trở lên và chưa có kết nối gas trong hộ gia đình.',
        tr: 'Uygunluk kriteri: Başvuru sahibi 18 yaşından büyük bir kadın olmalı ve hanede önceden gaz bağlantısı bulunmamalıdır.',
        sw: 'Vigezo vya ustahiki: Mwombaji lazima awe mwanamke mtu mzima (18+) asiye na muunganisho wa gesi awali nyumbani.',
        ne: 'योग्यता मापदण्ड: आवेदक १८ वर्षभन्दा माथिको महिला हुनुपर्छ र परिवारमा पहिले कुनै ग्यास जडान हुनुहुँदैन।',
        si: 'සුදුසුකම් නිර්ණායක: අයදුම්කරු වයස අවුරුදු 18ට වැඩි කාන්තාවක් විය යුතු අතර නිවසේ පෙර ගෑස් සම්බන්ධතාවයක් නොතිබිය යුතුය.',
      };
      return msgs[lang] || msgs['en'];
    }
  };

  /**
   * Eligibility calculator
   */
  const evaluateEligibility = () => {
    const isEligible = eligibilityAnswers.adultWoman && eligibilityAnswers.noCurrentConnection && eligibilityAnswers.hasBankAcc;
    const msg = getEligibilityMessage(currentLang, isEligible);
    setEligibilityResult(msg);
    speak(msg, currentLang);
  };

  return (
    <div className="min-h-screen bg-[#101014] text-white flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-[#101014]/90 backdrop-blur-md border-b border-[#2d2d38] px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActivePage('home')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#ff6fae] to-[#ff9bc5] flex items-center justify-center text-black font-extrabold shadow-md shadow-[#ff6fae]/20">
              🎙️
            </div>
            <div>
              <div className="font-extrabold tracking-wide text-lg sm:text-xl">
                SAHAYAK <span className="text-[#ff6fae]">AI</span>
              </div>
              <div className="text-[11px] text-zinc-400 font-medium hidden sm:block">
                {t.appSub}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Continuous Voice Assistant Mode Toggle */}
            <button
              onClick={() => {
                const next = !continuousMode;
                setContinuousMode(next);
                if (next) {
                  speak(getContinuousModeGreeting(currentLang), currentLang);
                } else {
                  stopSpeaking();
                }
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border ${
                continuousMode
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-[#1c1c24] text-zinc-400 border-zinc-700 hover:text-white'
              }`}
              title="Continuous Voice Assistant Mode: Automatically listens for your next voice command after speaking."
            >
              <span className={`w-2 h-2 rounded-full ${continuousMode ? 'bg-emerald-400 animate-ping' : 'bg-zinc-600'}`} />
              <span className="hidden sm:inline">{continuousMode ? 'Auto-Listen: ON' : 'Voice Mode'}</span>
            </button>

            {/* Detected Language Indicator (Auto-detected, never forced manually) */}
            <div className="bg-[#1c1c24] border border-[#ff6fae]/30 px-3 py-1.5 rounded-full flex items-center space-x-2 text-xs font-semibold shadow-inner">
              <span className="text-sm">{currentLangInfo.flag}</span>
              <span className="text-[#ff9bc5]">{currentLangInfo.name}</span>
              <span className="text-zinc-400 hidden xs:inline font-normal">
                ({currentLangInfo.nativeName})
              </span>
            </div>

            {/* Read / Pause / Resume Voice Button */}
            <button
              onClick={
                ttsState.status === 'playing'
                  ? pauseSpeaking
                  : ttsState.status === 'paused'
                  ? resumeSpeaking
                  : readCurrentPage
              }
              className={`p-2 rounded-xl text-sm font-semibold transition flex items-center space-x-1.5 ${
                ttsState.status === 'playing'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                  : ttsState.status === 'paused'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-[#22222a] hover:bg-[#2c2c36] text-zinc-300 border border-zinc-700'
              }`}
              title={
                ttsState.status === 'playing'
                  ? 'Pause Voice'
                  : ttsState.status === 'paused'
                  ? 'Resume Voice'
                  : t.readAloud
              }
            >
              {ttsState.status === 'playing' ? (
                <Pause className="w-4 h-4" />
              ) : ttsState.status === 'paused' ? (
                <Play className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              <span className="text-xs hidden md:inline">
                {ttsState.status === 'playing'
                  ? 'Pause'
                  : ttsState.status === 'paused'
                  ? 'Resume'
                  : t.readAloud}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 flex flex-col">
        {/* Multilingual Voice Speech Player & Controls Bar */}
        {(ttsState.status === 'playing' || ttsState.status === 'paused') && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-[#1c1825] to-[#1e1520] border border-[#ff6fae]/50 shadow-2xl text-left animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-black ${
                    ttsState.status === 'playing'
                      ? 'bg-[#ff6fae] shadow-lg shadow-[#ff6fae]/30 animate-pulse'
                      : 'bg-amber-400'
                  }`}
                >
                  {ttsState.status === 'playing' ? (
                    <Volume2 className="w-5 h-5 text-black" />
                  ) : (
                    <Pause className="w-5 h-5 text-black" />
                  )}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider">
                      {ttsState.status === 'playing' ? 'Speaking Aloud' : 'Speech Paused'}
                    </span>
                    <span className="text-[11px] bg-[#ff6fae]/20 text-[#ff9bc5] font-semibold px-2 py-0.5 rounded-full">
                      Sentence {ttsState.currentChunkIndex + 1} of {ttsState.chunks.length}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>
                      Voice: <strong className="text-zinc-300">{ttsState.voiceInfo?.voiceName || 'System'}</strong> ({ttsState.voiceInfo?.langUsed || currentLang})
                    </span>
                    {ttsState.voiceInfo?.isNative ? (
                      <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>Compatible Voice</span>
                      </span>
                    ) : (
                      <span
                        className="text-amber-400 font-semibold"
                        title="Native voice pack not found on this device; using system fallback voice"
                      >
                        ⚠️ Fallback Voice Used
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Pause/Resume, Stop, Replay */}
              <div className="flex items-center space-x-2 self-end sm:self-auto">
                {ttsState.status === 'playing' ? (
                  <button
                    onClick={pauseSpeaking}
                    className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 border border-zinc-700 transition"
                    title="Pause Voice"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                ) : (
                  <button
                    onClick={resumeSpeaking}
                    className="py-1.5 px-3 bg-[#ff6fae] hover:bg-[#ff85ba] text-black rounded-xl text-xs font-bold flex items-center space-x-1.5 transition shadow-md shadow-[#ff6fae]/20"
                    title="Resume Voice"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                )}

                <button
                  onClick={stopSpeaking}
                  className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-rose-300 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 border border-zinc-700 transition"
                  title="Stop Voice"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>

                <button
                  onClick={replaySpeaking}
                  className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 border border-zinc-700 transition"
                  title="Replay Complete Speech"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Replay</span>
                </button>
              </div>
            </div>

            {/* Live Sentence Highlight */}
            <div className="mt-3 p-2.5 rounded-xl bg-black/60 border border-zinc-800/80 text-xs sm:text-sm text-zinc-200 leading-relaxed font-medium">
              "{ttsState.currentChunkText}"
            </div>

            {/* Progress Track */}
            <div className="w-full bg-zinc-800/90 h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#ff6fae] to-[#ff9bc5] h-full transition-all duration-300"
                style={{ width: `${ttsState.progressPercent}%` }}
              />
            </div>
          </div>
        )}
        {/* Action Confirmation Banner */}
        {actionNotice && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-lg shadow-emerald-950/30 animate-in fade-in">
            <div className="flex items-center space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{actionNotice}</span>
            </div>
            <div className="flex items-center space-x-2">
              {actionNotice.includes('pmuy.gov.in') && (
                <a
                  href="https://www.pmuy.gov.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg flex items-center space-x-1 transition"
                >
                  <span>Open Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                onClick={() => setActionNotice(null)}
                className="text-emerald-400 hover:text-white font-bold text-xs px-2 py-1 rounded-lg bg-emerald-900/50 hover:bg-emerald-800"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-950/40 border border-rose-600/40 text-rose-200 flex items-start justify-between shadow-lg">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm">{errorMessage}</div>
                <div className="text-xs text-rose-300/80 mt-1">
                  You can also test each language individually using the quick test buttons below.
                </div>
              </div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white text-xs font-bold px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* ----------------- PAGE 1: HOME ----------------- */}
        {activePage === 'home' && (
          <section className="space-y-6">
            {/* Hero Banner */}
            <div className="text-center py-4 sm:py-6">
              <div className="inline-flex p-3 rounded-2xl bg-[#ff6fae]/10 border border-[#ff6fae]/20 text-3xl mb-3 shadow-sm">
                🎙️
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white">
                {t.homeTitle}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                {t.homeSub}
              </p>
            </div>

            {/* Central Mic & Status Card */}
            <div className="bg-[#18181e] border border-[#2e2e38] rounded-3xl p-6 sm:p-8 text-center shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#ff6fae]/40 to-transparent" />

              {/* Continuous Voice Assistant Mode Switch */}
              <div className="flex justify-center mb-4">
                <button
                  onClick={() => {
                    const next = !continuousMode;
                    setContinuousMode(next);
                    if (next) {
                      speak(getContinuousModeGreeting(currentLang), currentLang);
                    } else {
                      stopSpeaking();
                    }
                  }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center space-x-2.5 border shadow-md ${
                    continuousMode
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-emerald-500/10'
                      : 'bg-[#22222a] text-zinc-300 border-zinc-700 hover:border-zinc-500'
                  }`}
                  title="When ON, assistant continuously listens for follow-up voice commands after speaking."
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${continuousMode ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                  <span>Continuous Voice Mode: {continuousMode ? 'ON (Auto-Listens after speaking)' : 'OFF (Tap to speak)'}</span>
                </button>
              </div>

              {/* Pulsing Mic Button */}
              <div className="relative inline-block my-2">
                {isRecording && (
                  <div className="absolute inset-0 rounded-full bg-[#ff6fae]/30 animate-ping scale-125 pointer-events-none" />
                )}
                <button
                  onClick={toggleRecording}
                  disabled={isProcessing}
                  aria-label="Microphone"
                  className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl relative z-10 ${
                    isRecording
                      ? 'bg-rose-600 border-8 border-rose-900/60 scale-105 shadow-rose-600/30'
                      : isProcessing
                      ? 'bg-zinc-800 border-8 border-zinc-700 animate-pulse text-zinc-400'
                      : 'bg-gradient-to-b from-[#ff6fae] to-[#f44795] hover:scale-105 border-8 border-[#54213a] text-black shadow-[#ff6fae]/25'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <MicOff className="w-14 h-14 sm:w-16 sm:h-16 text-white animate-pulse" />
                      <span className="text-xs font-bold text-white uppercase mt-1 tracking-wider">
                        Tap to Stop
                      </span>
                    </>
                  ) : isProcessing ? (
                    <>
                      <div className="w-12 h-12 border-4 border-[#ff6fae] border-t-transparent rounded-full animate-spin mb-2" />
                      <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                        Thinking...
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-14 h-14 sm:w-16 sm:h-16 text-black" />
                      <span className="text-xs font-black text-black uppercase mt-1 tracking-wider">
                        Tap & Speak
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Status Message */}
              <div className="min-h-[28px] mt-2 font-bold text-sm sm:text-base text-zinc-200">
                {statusMessage}
              </div>

              {/* Transcript & Response Area */}
              <div className="mt-5 p-4 rounded-2xl bg-[#0c0c0f] border border-[#2b2b34] text-left">
                <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Recognition & Audio Feed</span>
                  {lastAction && (
                    <span className="text-[#ff9bc5] font-semibold">Action: {lastAction}</span>
                  )}
                </div>
                <div className="text-sm sm:text-base text-zinc-200 leading-relaxed font-medium min-h-[44px]">
                  {transcript || lastReply || t.transPlaceholder}
                </div>
                {lastReply && (
                  <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                    <span className="text-xs text-[#ff9bc5] font-semibold">
                      Spoken reply ({LANGUAGES[currentLang].name})
                    </span>
                    <button
                      onClick={() => speak(lastReply, currentLang)}
                      className="inline-flex items-center space-x-1 text-xs text-zinc-300 hover:text-white bg-zinc-800 px-2.5 py-1 rounded-lg"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{t.resultListenAgain}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Natural Voice Command & Follow-Up Suggestions */}
              <div className="mt-5 pt-4 border-t border-zinc-800/80 text-left">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                  <span>💡 Voice Commands & Natural Follow-ups (Speak or Tap):</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Context-Aware</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { label: 'Find my required government service', query: 'Find my required government service' },
                    { label: 'Explain eligibility requirements', query: 'Explain the eligibility requirements for PMUY' },
                    { label: 'Which documents do I need?', query: 'Tell me which documents I need for LPG gas connection' },
                    { label: 'Open official application website', query: 'Open the official application website' },
                    { label: 'Explain the next step', query: 'Explain the next step' },
                    { label: 'Read that again', query: 'Read that again' },
                    { label: 'Stop speaking', query: 'Stop speaking' },
                  ].map((cmd, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        stopSpeaking();
                        if (cmd.query === 'Stop speaking') {
                          stopSpeaking();
                          setStatusMessage('⏹ Audio stopped as instructed.');
                        } else if (cmd.query === 'Read that again') {
                          replaySpeaking();
                        } else {
                          handleTestLanguage(currentLang, cmd.query);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#23232c] hover:bg-[#ff6fae] hover:text-black text-zinc-300 text-xs font-semibold border border-zinc-700/80 transition-all shadow-sm flex items-center space-x-1.5 group"
                    >
                      <span className="text-zinc-500 group-hover:text-black">💬</span>
                      <span>"{cmd.label}"</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Core Action Navigation Buttons (Requirement 12: Do not remove existing buttons) */}
            <div className="bg-[#18181e] border border-[#2e2e38] rounded-3xl p-5 sm:p-6 shadow-xl">
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                Quick Navigation & Actions
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <button
                  onClick={() => {
                    setActivePage('scheme');
                    speak(t.schemeTitle, currentLang);
                  }}
                  className="p-5 rounded-2xl bg-[#23232b] hover:bg-[#2b2b36] border border-zinc-700/80 hover:border-[#ff6fae]/50 text-left font-bold text-base transition flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">🏛️</span>
                    <span>{t.btnScheme}</span>
                  </div>
                  <span className="text-zinc-500 group-hover:text-[#ff6fae] transition">→</span>
                </button>

                <button
                  onClick={() => {
                    setActivePage('documents');
                    speak(t.docsTitle, currentLang);
                  }}
                  className="p-5 rounded-2xl bg-[#23232b] hover:bg-[#2b2b36] border border-zinc-700/80 hover:border-[#ff6fae]/50 text-left font-bold text-base transition flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">📄</span>
                    <span>{t.btnDocuments}</span>
                  </div>
                  <span className="text-zinc-500 group-hover:text-[#ff6fae] transition">→</span>
                </button>

                <button
                  onClick={() => {
                    setActivePage('location');
                    speak(t.locTitle, currentLang);
                  }}
                  className="p-5 rounded-2xl bg-[#23232b] hover:bg-[#2b2b36] border border-zinc-700/80 hover:border-[#ff6fae]/50 text-left font-bold text-base transition flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">📍</span>
                    <span>{t.btnLocation}</span>
                  </div>
                  <span className="text-zinc-500 group-hover:text-[#ff6fae] transition">→</span>
                </button>

                <button
                  onClick={readCurrentPage}
                  className="p-5 rounded-2xl bg-[#23232b] hover:bg-[#2b2b36] border border-zinc-700/80 hover:border-[#ff6fae]/50 text-left font-bold text-base transition flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">🔊</span>
                    <span>{t.btnRead}</span>
                  </div>
                  <span className="text-zinc-500 group-hover:text-[#ff6fae] transition">🔊</span>
                </button>
              </div>
            </div>

            {/* Multilingual Voice Test Section (Requirement: Test Tamil, Telugu, Hindi, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Urdu, Odia, Assamese, Spanish, French, German, Arabic, Chinese, Japanese, etc.) */}
            <div className="bg-[#14141a] border border-[#2b2b36] rounded-3xl p-5 sm:p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-5 h-5 text-[#ff6fae]" />
                    <h2 className="font-extrabold text-base sm:text-lg text-white">
                      {t.testSectionTitle}
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                    {t.testSectionSub}
                  </p>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center space-x-1.5 bg-[#1b1b22] p-1 rounded-xl border border-zinc-800 self-start sm:self-auto text-xs font-semibold">
                  <button
                    onClick={() => setLangTab('all')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      langTab === 'all'
                        ? 'bg-[#ff6fae] text-black font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    All ({Object.keys(LANGUAGES).length})
                  </button>
                  <button
                    onClick={() => setLangTab('indian')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      langTab === 'indian'
                        ? 'bg-[#ff6fae] text-black font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Indian (14)
                  </button>
                  <button
                    onClick={() => setLangTab('global')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      langTab === 'global'
                        ? 'bg-[#ff6fae] text-black font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Global (18)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Object.values(LANGUAGES)
                  .filter((item) => {
                    const indianCodes = [
                      'hi', 'ta', 'te', 'kn', 'ml', 'bn', 'mr', 'gu',
                      'pa', 'ur', 'or', 'as', 'ne', 'si'
                    ];
                    if (langTab === 'indian') return indianCodes.includes(item.code);
                    if (langTab === 'global') return !indianCodes.includes(item.code) || item.code === 'en';
                    return true;
                  })
                  .map((item) => (
                    <div
                      key={item.code}
                      className={`p-3.5 rounded-2xl border transition text-left flex flex-col justify-between ${
                        currentLang === item.code
                          ? 'bg-[#221c25] border-[#ff6fae] shadow-md shadow-[#ff6fae]/10'
                          : 'bg-[#1b1b22] border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-xl">{item.flag}</span>
                            <div>
                              <span className="font-bold text-sm text-white block">
                                {item.name}
                              </span>
                              <span className="text-xs text-zinc-400">{item.nativeName}</span>
                            </div>
                          </div>
                          {currentLang === item.code && (
                            <span className="text-[10px] bg-[#ff6fae]/20 text-[#ff9bc5] font-bold px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-300 italic bg-black/40 p-2 rounded-lg my-2 line-clamp-2">
                          "{item.samplePhrase}"
                        </div>
                      </div>

                      <button
                        onClick={() => handleTestLanguage(item.code)}
                        disabled={isProcessing}
                        className="w-full mt-2 py-2 px-3 rounded-xl bg-[#ff6fae]/20 hover:bg-[#ff6fae] text-[#ff9bc5] hover:text-black font-bold text-xs transition flex items-center justify-center space-x-1.5"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Test {item.name} Voice</span>
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}

        {/* ----------------- PAGE 2: SCHEME (PMUY) ----------------- */}
        {activePage === 'scheme' && (
          <section className="space-y-6">
            <button
              onClick={() => setActivePage('home')}
              className="inline-flex items-center space-x-2 text-zinc-300 hover:text-white font-bold text-sm bg-zinc-800/80 hover:bg-zinc-800 px-4 py-2 rounded-xl transition border border-zinc-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t.back}</span>
            </button>

            <div className="bg-[#18181e] border border-[#2e2e38] rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="inline-block px-3 py-1 rounded-full bg-[#ff6fae]/20 text-[#ff9bc5] text-xs font-bold mb-2">
                    Official Government Welfare
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                    {t.schemeTitle}
                  </h2>
                </div>
                <button
                  onClick={readCurrentPage}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 border border-zinc-700 transition"
                  title="Read full scheme details and instructions aloud"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{t.readAloud}</span>
                </button>
              </div>

              <p className="mt-4 text-zinc-300 leading-relaxed text-sm sm:text-base">
                {t.schemeDesc}
              </p>

              {/* Notice Banner */}
              <div className="mt-5 p-4 rounded-xl border-l-4 border-[#ff6fae] bg-[#22222a] text-zinc-200 text-sm font-semibold flex items-center space-x-3">
                <Info className="w-5 h-5 text-[#ff6fae] shrink-0" />
                <span>{t.schemeNotice}</span>
              </div>

              {/* Step by Step Breakdown */}
              <div className="mt-6 space-y-3.5">
                <div className="p-4 rounded-2xl bg-[#121217] border border-zinc-800">
                  <div className="font-bold text-white text-base flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-[#ff6fae] text-black text-xs font-extrabold flex items-center justify-center">
                      1
                    </span>
                    <span>{t.schemeStep1Title}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 pl-8">
                    {t.schemeStep1Desc}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#121217] border border-zinc-800">
                  <div className="font-bold text-white text-base flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-[#ff6fae] text-black text-xs font-extrabold flex items-center justify-center">
                      2
                    </span>
                    <span>{t.schemeStep2Title}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 pl-8">
                    {t.schemeStep2Desc}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#121217] border border-zinc-800">
                  <div className="font-bold text-white text-base flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-[#ff6fae] text-black text-xs font-extrabold flex items-center justify-center">
                      3
                    </span>
                    <span>{t.schemeStep3Title}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 pl-8">
                    {t.schemeStep3Desc}
                  </p>
                </div>
              </div>

              {/* Interactive Eligibility Quick Check */}
              <div className="mt-8 p-5 rounded-2xl bg-[#202029] border border-zinc-700/80">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-[#ff6fae]" />
                  <span>{t.eligibilityTitle}</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1 mb-4">{t.eligibilityDesc}</p>

                <div className="space-y-2.5">
                  <label className="flex items-center space-x-3 text-xs sm:text-sm text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eligibilityAnswers.adultWoman}
                      onChange={(e) =>
                        setEligibilityAnswers((prev) => ({ ...prev, adultWoman: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-[#ff6fae] focus:ring-[#ff6fae]"
                    />
                    <span>Woman applicant is aged 18 or above (18+ வயதுள்ள பெண்)</span>
                  </label>

                  <label className="flex items-center space-x-3 text-xs sm:text-sm text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eligibilityAnswers.noCurrentConnection}
                      onChange={(e) =>
                        setEligibilityAnswers((prev) => ({
                          ...prev,
                          noCurrentConnection: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-[#ff6fae] focus:ring-[#ff6fae]"
                    />
                    <span>No existing LPG connection in the same household</span>
                  </label>

                  <label className="flex items-center space-x-3 text-xs sm:text-sm text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eligibilityAnswers.hasBankAcc}
                      onChange={(e) =>
                        setEligibilityAnswers((prev) => ({ ...prev, hasBankAcc: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-[#ff6fae] focus:ring-[#ff6fae]"
                    />
                    <span>Active savings bank account with Aadhaar linkage</span>
                  </label>
                </div>

                <div className="mt-4 flex items-center space-x-3">
                  <button
                    onClick={evaluateEligibility}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs border border-zinc-600 transition"
                  >
                    {t.eligibilityCheckBtn}
                  </button>
                  {eligibilityResult && (
                    <div className="text-xs font-semibold text-[#ff9bc5]">{eligibilityResult}</div>
                  )}
                </div>
              </div>

              {/* Official Link Button (User requirement: Open Official PMUY Website) */}
              <div className="mt-6 pt-4 border-t border-zinc-800">
                <a
                  href="https://www.pmuy.gov.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#ff6fae] to-[#ff85ba] hover:brightness-110 text-black font-extrabold text-base transition flex items-center justify-center space-x-2 shadow-lg shadow-[#ff6fae]/20"
                >
                  <span>{t.schemeOfficialBtn}</span>
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>
          </section>
        )}

        {/* ----------------- PAGE 3: DOCUMENTS ----------------- */}
        {activePage === 'documents' && (
          <section className="space-y-6">
            <button
              onClick={() => setActivePage('home')}
              className="inline-flex items-center space-x-2 text-zinc-300 hover:text-white font-bold text-sm bg-zinc-800/80 hover:bg-zinc-800 px-4 py-2 rounded-xl transition border border-zinc-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t.back}</span>
            </button>

            <div className="bg-[#18181e] border border-[#2e2e38] rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="inline-block px-3 py-1 rounded-full bg-[#ff6fae]/20 text-[#ff9bc5] text-xs font-bold mb-2">
                    Checklist & Verification
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{t.docsTitle}</h2>
                </div>
                <button
                  onClick={readCurrentPage}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 border border-zinc-700 transition"
                  title="Read all required documents and notes aloud"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{t.readAloud}</span>
                </button>
              </div>

              <p className="mt-4 text-zinc-300 leading-relaxed text-sm sm:text-base">{t.docsDesc}</p>

              {/* Documents Checklist List */}
              <div className="mt-6 space-y-3">
                {[
                  { id: 'doc1', title: t.docItem1Title, desc: t.docItem1Desc },
                  { id: 'doc2', title: t.docItem2Title, desc: t.docItem2Desc },
                  { id: 'doc3', title: t.docItem3Title, desc: t.docItem3Desc },
                  { id: 'doc4', title: t.docItem4Title, desc: t.docItem4Desc },
                  { id: 'doc5', title: t.docItem5Title, desc: t.docItem5Desc },
                ].map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() =>
                      setCheckedDocs((prev) => ({ ...prev, [doc.id]: !prev[doc.id] }))
                    }
                    className={`p-4 rounded-2xl border transition cursor-pointer flex items-start space-x-3.5 ${
                      checkedDocs[doc.id]
                        ? 'bg-[#1e2720] border-emerald-600/40 text-emerald-200'
                        : 'bg-[#131318] border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                        checkedDocs[doc.id]
                          ? 'bg-emerald-500 border-emerald-400 text-black'
                          : 'border-zinc-600 bg-zinc-800'
                      }`}
                    >
                      {checkedDocs[doc.id] && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="font-bold text-sm sm:text-base text-white">{doc.title}</div>
                      <div className="text-xs sm:text-sm text-zinc-400 mt-0.5">{doc.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
                💡 <span className="font-semibold text-zinc-300">{t.checklistNotice}</span>
              </div>
            </div>
          </section>
        )}

        {/* ----------------- PAGE 4: LOCATION ----------------- */}
        {activePage === 'location' && (
          <section className="space-y-6">
            <button
              onClick={() => setActivePage('home')}
              className="inline-flex items-center space-x-2 text-zinc-300 hover:text-white font-bold text-sm bg-zinc-800/80 hover:bg-zinc-800 px-4 py-2 rounded-xl transition border border-zinc-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t.back}</span>
            </button>

            <div className="bg-[#18181e] border border-[#2e2e38] rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="inline-block px-3 py-1 rounded-full bg-[#ff6fae]/20 text-[#ff9bc5] text-xs font-bold mb-2">
                    Citizen Service Center Map
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{t.locTitle}</h2>
                </div>
                <button
                  onClick={readCurrentPage}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 border border-zinc-700 transition"
                  title="Read service center locations aloud"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{t.readAloud}</span>
                </button>
              </div>

              <p className="mt-4 text-zinc-300 leading-relaxed text-sm sm:text-base">{t.locDesc}</p>

              {/* Allow Location CTA */}
              <div className="mt-6">
                <button
                  onClick={requestLocation}
                  className="w-full sm:w-auto py-3.5 px-6 rounded-2xl bg-[#ff6fae] hover:bg-[#ff80b7] text-black font-extrabold text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-[#ff6fae]/20"
                >
                  <MapPin className="w-4 h-4" />
                  <span>{t.locBtn}</span>
                </button>

                {locationStatus === 'granted' && (
                  <div className="mt-4 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-600/40 text-emerald-300 text-xs font-semibold flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      {t.locGranted}{' '}
                      {coords && (
                        <span className="text-zinc-400">
                          (Approx: {coords.lat.toFixed(2)}°N, {coords.lng.toFixed(2)}°E)
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {locationStatus === 'denied' && (
                  <div className="mt-4 p-3.5 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-300 text-xs font-semibold">
                    {t.locDenied}
                  </div>
                )}
              </div>

              {/* Nearby Centers List */}
              <div className="mt-8">
                <h3 className="text-base font-bold text-white mb-3 flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-[#ff6fae]" />
                  <span>{t.nearbyCentersTitle}</span>
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  <div className="p-4 rounded-2xl bg-[#121217] border border-zinc-800">
                    <div className="font-bold text-white text-sm sm:text-base flex items-center justify-between">
                      <span>{t.center1Title}</span>
                      <span className="text-xs text-emerald-400 font-semibold">Open • 0.8 km</span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">{t.center1Desc}</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#121217] border border-zinc-800">
                    <div className="font-bold text-white text-sm sm:text-base flex items-center justify-between">
                      <span>{t.center2Title}</span>
                      <span className="text-xs text-zinc-400 font-semibold">10:00 AM - 5:00 PM • 2.5 km</span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">{t.center2Desc}</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#121217] border border-zinc-800">
                    <div className="font-bold text-white text-sm sm:text-base flex items-center justify-between">
                      <span>{t.center3Title}</span>
                      <span className="text-xs text-emerald-400 font-semibold">Authorized Agency • 1.2 km</span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">{t.center3Desc}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ----------------- PAGE 5: RESULT ----------------- */}
        {activePage === 'result' && (
          <section className="space-y-6">
            <button
              onClick={() => setActivePage('home')}
              className="inline-flex items-center space-x-2 text-zinc-300 hover:text-white font-bold text-sm bg-zinc-800/80 hover:bg-zinc-800 px-4 py-2 rounded-xl transition border border-zinc-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t.back}</span>
            </button>

            <div className="bg-[#18181e] border border-[#2e2e38] rounded-3xl p-6 sm:p-8 shadow-xl text-left">
              <div className="flex items-center space-x-3 mb-4">
                <span className="text-3xl">{currentLangInfo.flag}</span>
                <div>
                  <div className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                    {t.detectedLangBadge}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                    {t.resultTitle}
                  </h2>
                </div>
              </div>

              {/* What you spoke */}
              <div className="mt-4 p-4 rounded-2xl bg-[#101014] border border-zinc-800">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  {t.resultSpoken}
                </div>
                <div className="text-base text-zinc-100 font-medium italic">
                  "{transcript || 'Speech processed'}"
                </div>
              </div>

              {/* Spoken reply */}
              <div className="mt-4 p-5 rounded-2xl bg-[#231a23] border border-[#ff6fae]/30">
                <div className="text-xs font-bold text-[#ff9bc5] uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>{t.resultReply}</span>
                  <button
                    onClick={() => speak(lastReply, currentLang)}
                    className="inline-flex items-center space-x-1 text-xs text-white bg-[#ff6fae]/30 hover:bg-[#ff6fae] hover:text-black font-bold px-3 py-1 rounded-lg transition"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{t.resultListenAgain}</span>
                  </button>
                </div>
                <div className="text-base sm:text-lg text-white font-semibold leading-relaxed mt-2">
                  {lastReply}
                </div>
              </div>

              {/* Actions suggestions */}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => setActivePage('scheme')}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs border border-zinc-700 transition"
                >
                  🏛️ {t.btnScheme}
                </button>
                <button
                  onClick={() => setActivePage('documents')}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs border border-zinc-700 transition"
                >
                  📄 {t.btnDocuments}
                </button>
                <button
                  onClick={() => setActivePage('location')}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs border border-zinc-700 transition"
                >
                  📍 {t.btnLocation}
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#23232c] py-4 px-4 text-center text-xs text-zinc-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="font-semibold text-zinc-400">
            SAHAYAK AI • <span className="text-zinc-500 font-normal">Your Voice. Your Language. Your Government Services.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-500">Multilingual:</span>
            <span>English</span>•
            <span>हिन्दी</span>•
            <span>தமிழ்</span>•
            <span>తెలుగు</span>•
            <span>ಕನ್ನಡ</span>•
            <span>മലയാളം</span>•
            <span>বাংলা</span>•
            <span>मराठी</span>•
            <span>ગુજરાતી</span>•
            <span>ਪੰਜਾਬੀ</span>•
            <span>اردو</span>•
            <span>32+ Languages</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

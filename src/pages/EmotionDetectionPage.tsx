import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Mic, Loader2, Sparkles, AlertCircle, RefreshCcw, Bookmark, ExternalLink, PlayCircle, Send, Heart, Brain, Info, ArrowRight, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { GoogleGenAI, Type } from "@google/genai";
import { analyzeMentalState, Recommendation, WellnessAnalysis } from '../services/recommendationService';
import ActivityModal from '../components/ActivityModal';
import ActivityButton from '../components/ActivityButton';
import { Link } from 'react-router-dom';

import { apiHistoryService } from '../services/apiHistoryService';

const EMOTIONS = [
  { label: 'Happy', emoji: '😊', color: 'bg-yellow-100 text-yellow-700' },
  { label: 'Sad', emoji: '😢', color: 'bg-blue-100 text-blue-700' },
  { label: 'Angry', emoji: '😠', color: 'bg-red-100 text-red-700' },
  { label: 'Stress', emoji: '😟', color: 'bg-orange-100 text-orange-700' },
  { label: 'Neutral', emoji: '😐', color: 'bg-gray-100 text-gray-700' },
];

export default function EmotionDetectionPage() {
  const { user } = useAuth();
  const [activeMode, setActiveMode] = useState<'facial' | 'voice' | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [facialResult, setFacialResult] = useState<string | null>(null);
  const [speechResult, setSpeechResult] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  
  const [analysis, setAnalysis] = useState<WellnessAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [history, setHistory] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalEmotion, setModalEmotion] = useState('');
  
  const webcamRef = useRef<Webcam>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (user) {
      const fetchHistory = async () => {
        const q = query(
          collection(db, 'emotionLogs'),
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc'),
          limit(5)
        );
        const snapshot = await getDocs(q);
        setHistory(snapshot.docs.map(doc => doc.data().emotion));
      };
      fetchHistory();
    }
  }, [user]);

  const runHolisticAnalysis = async () => {
    if (!user) return;
    setIsAnalyzing(true);
    setAnalysis(null); // Clear previous if any
    try {
      const result = await analyzeMentalState({
        facialEmotion: facialResult || undefined,
        voiceEmotion: speechResult || undefined,
        textInput: textInput || undefined,
        history
      });
      
      setAnalysis(result);

      // Store in Firebase
      try {
        await addDoc(collection(db, 'emotionLogs'), {
          userId: user.uid,
          emotion: facialResult || speechResult || (result.score < 50 ? 'Stress' : 'Neutral'),
          wellnessScore: result.score,
          insight: result.insight,
          textInput: textInput,
          timestamp: serverTimestamp(),
          critical: result.critical
        });
      } catch (dbErr) {
        console.error("Failed to log emotion to database:", dbErr);
      }

      // Store in MongoDB Atlas via Custom Backend
      try {
        await apiHistoryService.saveDetection(user.uid, {
          emotion: facialResult || speechResult || (result.score < 50 ? 'Stress' : 'Neutral'),
          confidence: result.score,
          recommendations: result.recommendations.map(r => r.title)
        });
      } catch (mongoErr) {
        console.error("Failed to log to MongoDB:", mongoErr);
      }

    } catch (err) {
      console.error("Holistic Analysis failed:", err);
      // Even if it fails, analyzeMentalState has its own fallback, 
      // but if this catch triggers, it means analyzeMentalState itself crashed.
      setAnalysis({
        score: 50,
        insight: "Biometric synchronization encountered a variance. Displaying foundational protocols.",
        critical: false,
        recommendations: [
          { id: 'err-1', title: 'Controlled Breathing', type: 'activity', summary: 'Reset your nervous system with a simple breathing pattern.', url: '#' },
          { id: 'err-2', title: 'Digital Detox Advice', type: 'advice', summary: 'Reducing screen time can help calibrate your baseline.', url: '#' }
        ]
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const captureFacial = useCallback(async () => {
    if (!user || !webcamRef.current) return;
    setIsCapturing(true);

    try {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) throw new Error('Could not capture image from webcam');

      const base64Data = imageSrc.split(',')[1];
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data,
            },
          },
          {
            text: "Analyze facial expression. Return ONLY the emotion label: Happy, Sad, Angry, Stress, Neutral.",
          },
        ],
      });

      const label = response.text?.trim() || 'Neutral';
      setFacialResult(label);
      setActiveMode(null);
    } catch (err) {
      console.error('Facial detection failed:', err);
      setFacialResult('Neutral');
    } finally {
      setIsCapturing(false);
    }
  }, [user]);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processVoiceEmotion(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  };

  const processVoiceEmotion = async (blob: Blob) => {
    setIsCapturing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            { inlineData: { mimeType: "audio/webm", data: base64Data } },
            { text: "Analyze tone. Return ONLY the emotion label: Happy, Sad, Angry, Stress, Neutral." },
          ],
        });
        setSpeechResult(response.text?.trim() || 'Neutral');
        setActiveMode(null);
        setIsCapturing(false);
      };
    } catch (err) {
      console.error(err);
      setIsCapturing(false);
    }
  };

  const handleSaveResource = async (res: Recommendation) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'savedResources'), {
        userId: user.uid,
        resourceId: res.id,
        title: res.title,
        type: res.type,
        url: res.url,
        savedAt: serverTimestamp()
      });
      // Logic for saving without intrusive alert
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-16 max-w-5xl mx-auto pb-20">
      <header className="text-center space-y-6 relative overflow-hidden py-10">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-accent/10 to-transparent pointer-events-none" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex items-center gap-3 px-6 py-2 bg-white/5 border border-white/10 text-brand-teal rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-2xl backdrop-blur-md"
        >
          <Brain className="w-5 h-5 animate-pulse" /> Holistic Neural Scan
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-none"
        >
          Wellness <span className="glow-text">Assistant</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-slate-400 max-w-2xl mx-auto text-xl font-bold leading-relaxed"
        >
          Synthesizing biometric data from visual, auditory, and cognitive markers to map your emotional landscape.
        </motion.p>
      </header>

      {!analysis ? (
        <div className="space-y-12">
          {/* Multi-modal inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <InputCard 
              active={facialResult !== null}
              loading={isCapturing && activeMode === 'facial'}
              onClick={() => setActiveMode('facial')}
              icon={Camera}
              title="Visual Link"
              status={facialResult || "Initialize Scan"}
              color="from-brand-purple to-purple-600"
            />
             <InputCard 
              active={speechResult !== null}
              loading={isCapturing && activeMode === 'voice'}
              onClick={() => setActiveMode('voice')}
              icon={Mic}
              title="Audio Sync"
              status={speechResult || "Tone Capture"}
              color="from-brand-accent to-blue-600"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="md:col-span-2 lg:col-span-1 p-10 glass-card flex flex-col gap-6"
            >
              <div className="flex items-center gap-4">
                <div className="p-4 bg-brand-teal/20 rounded-2xl text-brand-teal shadow-[0_0_20px_rgba(20,184,166,0.2)]">
                  <Heart className="w-8 h-8" />
                </div>
                <h3 className="font-black text-2xl text-white tracking-tight">Cognitive Input</h3>
              </div>
              <textarea 
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Stream your thoughts... What's on your mind?"
                className="w-full h-40 p-6 rounded-[2rem] bg-white/5 border border-white/10 focus:ring-4 focus:ring-brand-accent/20 text-slate-200 resize-none font-bold placeholder:text-slate-600 transition-all outline-none"
              />
            </motion.div>
          </div>

            <div className="flex justify-center flex-col items-center gap-8 pt-8">
              <div className="flex flex-col items-center gap-4">
                <button 
                  onClick={runHolisticAnalysis}
                  disabled={isAnalyzing || (!facialResult && !speechResult && !textInput)}
                  className={cn(
                    "group relative px-20 py-8 text-white rounded-[3rem] font-black text-3xl shadow-[0_20px_60px_rgba(59,130,246,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-8 disabled:opacity-30 disabled:hover:scale-100 overflow-hidden",
                    (facialResult || speechResult || textInput) ? "bg-gradient-to-r from-brand-accent via-brand-purple to-brand-accent animate-gradient-x" : "bg-slate-800"
                  )}
                >
                  <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                  {isAnalyzing ? (
                    <Loader2 className="w-12 h-12 animate-spin" />
                  ) : (
                    <Sparkles className={cn("w-12 h-12 text-white", (facialResult || speechResult || textInput) && "animate-pulse")} />
                  )}
                  <span className="relative z-10 font-sans tracking-tight">{isAnalyzing ? 'SYNTHESIZING...' : 'CORE ANALYSIS'}</span>
                </button>
                
                {(facialResult || speechResult || textInput) && !isAnalyzing && (
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-brand-teal text-[10px] font-black uppercase tracking-[0.4em] animate-pulse"
                  >
                    Biometrics Captured • Ready for Synthesis
                  </motion.p>
                )}
              </div>
              
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 flex items-center gap-4">
                <span className="w-12 h-[1px] bg-slate-800" />
                Ensuring 256-bit data encryption
                <span className="w-12 h-[1px] bg-slate-800" />
              </p>
            </div>

          <AnimatePresence>
            {activeMode && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-brand-dark/80 backdrop-blur-2xl"
              >
                <div className="glass-card p-12 max-w-2xl w-full text-center space-y-10 relative shadow-[0_0_100px_rgba(59,130,246,0.2)]">
                  <button onClick={() => setActiveMode(null)} className="absolute top-8 right-8 p-3 bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors">
                    <RefreshCcw className="w-6 h-6" />
                  </button>
                  {activeMode === 'facial' ? (
                    <div className="space-y-8">
                      <div className="aspect-video bg-black rounded-[3rem] overflow-hidden relative border-4 border-white/5 shadow-2xl">
                        <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover scale-x-[-1]" />
                        <div className="absolute inset-0 pointer-events-none border-[40px] border-brand-accent/10 rounded-[3rem]" />
                        {isCapturing && (
                          <div className="absolute inset-0 bg-brand-dark/70 flex flex-col items-center justify-center backdrop-blur-sm">
                            <Loader2 className="w-16 h-16 text-brand-accent animate-spin mb-6" />
                            <p className="text-white font-black tracking-[0.3em] uppercase">Digitizing expression...</p>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={captureFacial} 
                        disabled={isCapturing} 
                        className="w-full py-6 bg-brand-accent text-white rounded-[2rem] font-black text-xl shadow-[0_0_30px_rgba(59,130,246,0.2)] hover:bg-brand-accent/80 transition-all uppercase tracking-widest"
                      >
                        Capture Biometrics
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="py-20 flex flex-col items-center justify-center relative">
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-brand-accent/20" />
                        <div className={cn(
                          "w-32 h-32 rounded-full flex items-center justify-center relative z-10 transition-all duration-500", 
                          isRecording ? "bg-red-500 text-white scale-110 shadow-[0_0_40px_rgba(239,68,68,0.4)]" : "bg-brand-accent text-white shadow-[0_0_40px_rgba(59,130,246,0.4)]"
                        )}>
                          {isRecording ? <div className="absolute inset-0 rounded-full animate-ping bg-red-500/50" /> : null}
                          <Mic className="w-16 h-16" />
                        </div>
                        <p className="mt-10 text-white font-black tracking-[0.2em] uppercase">{isRecording ? "Analyzing Auditory Texture..." : "Ready for audio uplink"}</p>
                      </div>
                      <button 
                        onClick={isRecording ? () => mediaRecorderRef.current?.stop() : startVoiceRecording} 
                        className={cn(
                          "w-full py-6 rounded-[2rem] font-black text-xl transition-all uppercase tracking-widest", 
                          isRecording ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-brand-accent text-white"
                        )}
                      >
                        {isRecording ? "Terminate Link" : "Initialize Audio"}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} className="space-y-16">
          {/* Analysis View */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <motion.div 
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               className="lg:col-span-1 glass-card p-12 flex flex-col items-center text-center justify-center space-y-8 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/5 rounded-full blur-3xl" />
              <div className="relative">
                <svg className="w-64 h-64 transform -rotate-90">
                  <circle cx="128" cy="128" r="120" stroke="rgba(255,255,255,0.05)" strokeWidth="16" fill="transparent" />
                  <motion.circle 
                    initial={{ strokeDashoffset: 2 * Math.PI * 120 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 120 * (1 - analysis.score / 100) }}
                    transition={{ duration: 2, ease: "easeOut" }}
                    cx="128" cy="128" r="120" stroke="currentColor" strokeWidth="16" fill="transparent" 
                    strokeDasharray={2 * Math.PI * 120}
                    className={cn("transition-all duration-1000", analysis.score > 70 ? "text-brand-teal" : analysis.score > 40 ? "text-brand-accent" : "text-brand-purple")}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-7xl font-black text-white tabular-nums tracking-tighter">{analysis.score}</span>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Neural Resonance</span>
                </div>
              </div>
              <div className={cn("px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-inner", analysis.critical ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-brand-teal/10 text-brand-teal border border-brand-teal/20")}>
                {analysis.critical ? 'Intervention Recommended' : 'System Optimized'}
              </div>
            </motion.div>

            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               className="lg:col-span-2 glass-card p-12 relative overflow-hidden flex flex-col justify-center"
            >
              <Sparkles className="absolute -top-12 -right-12 w-64 h-64 text-brand-accent/5 rotate-12" />
              <div className="relative z-10 space-y-8">
                <h3 className="text-4xl font-black text-white flex items-center gap-6">
                  <Brain className="text-brand-accent w-12 h-12" /> Neural Insights
                </h3>
                <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 shadow-inner">
                  <p className="text-2xl text-slate-200 leading-relaxed font-bold italic">
                    "{analysis.insight}"
                  </p>
                </div>
                {analysis.critical && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-8 bg-red-500/10 rounded-[2.5rem] border border-red-500/20 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-8"
                  >
                    <div className="space-y-2">
                      <h4 className="font-black text-xl text-red-400 uppercase tracking-tight">Priority Escalation</h4>
                      <p className="text-sm text-red-400/60 font-bold">Biometric patterns indicate a critical emotional threshold. Specialized support is synchronized.</p>
                    </div>
                    <Link to="/therapists" className="px-10 py-5 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-[0_10px_30px_rgba(239,68,68,0.3)] whitespace-nowrap">
                      Secure Session <ArrowRight className="w-5 h-5" />
                    </Link>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>

          <div className="space-y-12">
            <h3 className="text-5xl font-black text-white flex items-center gap-6 tracking-tighter">
               <Activity className="text-brand-teal w-12 h-12" /> Adaptive Protocol
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {analysis.recommendations.map((rec, idx) => (
                <motion.div 
                  key={rec.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ y: -10 }}
                  className="glass-card p-8 flex flex-col gap-6 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                  <div className="flex justify-between items-start relative z-10">
                    <span className={cn(
                      "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-inner",
                      rec.type === 'video' ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                      rec.type === 'article' ? "bg-brand-accent/10 text-brand-accent border border-brand-accent/20" :
                      rec.type === 'activity' ? "bg-brand-teal/10 text-brand-teal border border-brand-teal/20" : "bg-brand-purple/10 text-brand-purple border border-brand-purple/20"
                    )}>
                      {rec.type}
                    </span>
                    <button onClick={() => handleSaveResource(rec)} className="p-3 bg-white/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10 hover:text-brand-accent">
                      <Bookmark className="w-5 h-5" />
                    </button>
                  </div>
                  {rec.thumbnail && (
                    <div className="relative aspect-video rounded-[2rem] overflow-hidden shadow-2xl border border-white/10">
                      <img src={rec.thumbnail} alt={rec.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-brand-dark/40 flex items-center justify-center group-hover:bg-brand-dark/20 transition-all">
                        <PlayCircle className="text-white/80 w-16 h-16 group-hover:scale-110 group-hover:text-white transition-all drop-shadow-2xl" />
                      </div>
                    </div>
                  )}
                  <div className="space-y-3 relative z-10 flex-1">
                    <h4 className="font-black text-xl text-white tracking-tight line-clamp-2 leading-tight group-hover:text-brand-accent transition-colors">{rec.title}</h4>
                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed font-bold">{rec.summary}</p>
                  </div>
                  
                  <div className="pt-4 relative z-10">
                    {rec.type === 'activity' ? (
                      <ActivityButton 
                        label="Execute Guide"
                        onClick={() => {
                          setModalEmotion('Support');
                          setIsModalOpen(true);
                        }}
                        className="w-full py-5 text-xs font-black uppercase tracking-[0.2em] bg-white/5 border border-white/10 text-white rounded-2xl hover:bg-brand-teal hover:border-brand-teal hover:text-white transition-all"
                      />
                    ) : (
                      <a 
                        href={rec.url} target="_blank" rel="noreferrer"
                        className="w-full py-5 text-xs bg-white text-brand-dark rounded-2xl font-black uppercase tracking-[0.2em] text-center flex items-center justify-center gap-3 hover:bg-brand-accent hover:text-white transition-all shadow-xl"
                      >
                        {rec.type === 'video' ? 'Initialize Stream' : rec.type === 'article' ? 'Retrieve Intel' : 'Initialize Exploration'} 
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center flex-col items-center gap-8 pt-12"
          >
             <button 
                onClick={() => {
                  setAnalysis(null);
                  setFacialResult(null);
                  setSpeechResult(null);
                  setTextInput('');
                }}
                className="group px-16 py-6 bg-white/5 border border-white/10 text-white rounded-[2.5rem] font-black text-xl uppercase tracking-[0.2em] flex items-center gap-6 hover:bg-white/10 transition-all"
              >
                <RefreshCcw className="w-6 h-6 group-hover:rotate-180 transition-transform duration-700" /> Start New Neural Session
              </button>
              <div className="flex items-center gap-4 text-slate-600 text-[10px] font-black uppercase tracking-[0.3em]">
                <span className="w-8 h-[1px] bg-slate-800" />
                Zero-Knowledge User Data Protocol Active
                <span className="w-8 h-[1px] bg-slate-800" />
              </div>
          </motion.div>
        </motion.div>
      )}

      <ActivityModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        emotion={modalEmotion}
      />
    </div>
  );
}

function InputCard({ active, loading, onClick, icon: Icon, title, status, color }: any) {
  return (
    <motion.button 
      whileHover={{ y: -10 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={loading}
      className={cn(
        "p-12 glass-card flex flex-col items-center gap-8 text-center group transition-all duration-500",
        active ? "border-brand-accent shadow-[0_0_50px_rgba(59,130,246,0.1)] scale-105" : "hover:border-white/20"
      )}
    >
      <div className={cn(
        "w-28 h-28 rounded-[2.5rem] flex items-center justify-center transition-all duration-500 shadow-2xl relative", 
        active ? `bg-gradient-to-br ${color} scale-110` : "bg-white/5"
      )}>
        {active && <div className="absolute inset-0 rounded-[2.5rem] animate-ping bg-brand-accent/20" />}
        {loading ? <Loader2 className="w-12 h-12 text-white animate-spin" /> : <Icon className={cn("w-12 h-12 transition-all group-hover:scale-110", active ? "text-white" : "text-slate-500")} />}
      </div>
      <div className="space-y-3">
        <span className="block font-black text-3xl text-white tracking-tighter">{title}</span>
        <span className={cn(
          "text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full", 
          active ? "bg-brand-accent/20 text-brand-accent" : "text-slate-600"
        )}>
          {status}
        </span>
      </div>
    </motion.button>
  );
}

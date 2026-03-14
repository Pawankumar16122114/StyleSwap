/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Camera, 
  Upload, 
  Sparkles, 
  Shirt, 
  Palette, 
  Calendar, 
  ChevronRight,
  RefreshCw,
  Image as ImageIcon,
  X,
  Loader2,
  LogOut,
  History,
  User as UserIcon,
  ArrowRight,
  Mail,
  Lock,
  UserPlus,
  ChevronLeft,
  Check,
  Trash2,
  Watch,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  setDoc,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteDoc
} from './firebase';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const STYLE_CATEGORIES = {
  "Global Traditional Dressing Styles": [
    "India: Saree (draped cloth), Kurta, and Sherwani",
    "Japan: Kimono (T-shaped wrapped garment) and Yukata",
    "Scotland: Kilt (pleated woolen garment)",
    "Middle East: Thobe (men) and Abaya/Burqa (women)",
    "West Africa: Dashiki and Kente cloth garments",
    "Latin America: Poncho and Sombrero"
  ],
  "International Fashion Aesthetics & Styles": [
    "Classic/Preppy",
    "Streetwear",
    "Bohemian (Boho)",
    "Minimalist",
    "Techwear",
    "Kawaii (Japanese Style)",
    "Lagenlook (German Style)",
    "Vintage/Retro",
    "Athleisure"
  ],
  "Common Modern Dress Classifications": [
    "Formal",
    "Business Casual",
    "Casual",
    "Resort Wear"
  ]
};

interface StylingSuggestion {
  style: string;
  colors: string[];
  accessories: string[];
  occasions: string[];
  tips: string[];
  recommendation?: string;
  gender?: string;
  dress?: string;
}

interface SavedOutfit extends StylingSuggestion {
  id: string;
  imageUrl: string;
  createdAt: any;
  type: 'person' | 'dress' | 'accessory';
}

type AuthMode = 'selection' | 'email-signin' | 'email-signup';
type AppView = 'home' | 'wardrobe' | 'selection' | 'styling-flow' | 'settings';
type StylingType = 'person' | 'dress' | 'accessory';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('selection');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [view, setView] = useState<AppView>('home');
  const [stylingType, setStylingType] = useState<StylingType | null>(null);
  const [step, setStep] = useState(1); // 1: Upload, 2: Style Selection, 3: Result
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  
  const [image, setImage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<StylingSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wardrobe, setWardrobe] = useState<SavedOutfit[]>([]);
  const [selectedOutfit, setSelectedOutfit] = useState<SavedOutfit | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    if (darkMode) {
      root.classList.add('dark');
      body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    setIsCameraOpen(true);
    setView('styling-flow');
    setStep(1);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }, 
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError("Could not access camera. Please ensure you have given permission.");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setImage(dataUrl);
        stopCamera();
        detectContent(dataUrl);
      }
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      if (currentUser) {
        const userEmail = currentUser.email || email || 'no-email@provided.com';
        const userDisplayName = currentUser.displayName || email.split('@')[0] || 'User';
        
        const userRef = doc(db, 'users', currentUser.uid);
        setDoc(userRef, {
          uid: currentUser.uid,
          email: userEmail,
          displayName: userDisplayName,
          photoURL: currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userDisplayName)}`,
          createdAt: serverTimestamp()
        }, { merge: true }).catch(err => {
          console.error("Error updating user profile:", err);
          // Using the specific error format requested in guidelines
          const errInfo = {
            error: err.message,
            operationType: 'write',
            path: `users/${currentUser.uid}`,
            authInfo: {
              userId: currentUser.uid,
              email: currentUser.email,
              emailVerified: currentUser.emailVerified,
              isAnonymous: currentUser.isAnonymous
            }
          };
          console.error('Firestore Error: ', JSON.stringify(errInfo));
        });
      }
    });
    return () => unsubscribe();
  }, [email]);

  // Wardrobe Listener
  useEffect(() => {
    if (!user) {
      setWardrobe([]);
      return;
    }
    const q = query(collection(db, 'wardrobe'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const outfits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SavedOutfit[];
      setWardrobe(outfits);
    });
    return () => unsubscribe();
  }, [user]);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError("Google sign in failed.");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (authMode === 'email-signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setImage(dataUrl);
        detectContent(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const detectContent = async (imageData: string) => {
    setIsDetecting(true);
    setStep(1.5); // New intermediate step
    try {
      const base64Data = imageData.split(',')[1];
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ 
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }, 
            { text: "Analyze this image. Is it a 'person', a 'dress' (clothing), or an 'accessory'? Return only the word." }
          ] 
        }],
      });
      const type = response.text?.toLowerCase().trim();
      if (type?.includes('person')) setStylingType('person');
      else if (type?.includes('dress') || type?.includes('cloth')) setStylingType('dress');
      else if (type?.includes('accessory')) setStylingType('accessory');
      
      setStep(2);
    } catch (err) {
      // Fallback to current styling type or 'person'
      if (!stylingType) setStylingType('person');
      setStep(2);
    } finally {
      setIsDetecting(false);
    }
  };

  const startStyling = async () => {
    if (!image || !user || !selectedStyle || !stylingType) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const base64Data = image.split(',')[1];
      const prompt = stylingType === 'person' 
        ? `Analyze this person's image. Detect their gender (Male/Female). 
           Then, suggest a complete outfit (Dress/Clothing) and Accessories based on the style: "${selectedStyle}".
           Also provide a "Better Choice" recommendation for an alternative outfit that might suit them even better.
           Return JSON with: style, gender, dress, accessories (array), colors (array), occasions (array), tips (array), recommendation.`
        : stylingType === 'dress'
        ? `Analyze this dress/clothing image. 
           1. Identify the specific dress style (e.g., A-line, Maxi, Cocktail, etc.).
           2. Confirm if it fits the selected aesthetic: "${selectedStyle}".
           3. Recommend exactly which occasions this specific dress is most suitable for.
           4. Provide a detailed list of matching accessories (shoes, jewelry, bags) that complement this dress.
           5. Provide a "Better Choice" recommendation for an alternative dress that might elevate the look.
           Return JSON with: style (the identified dress style), accessories (array), colors (array), occasions (array), tips (array), recommendation.`
        : `Analyze this accessory image. 
           1. Identify the accessory's style and material.
           2. Recommend exactly which dress styles (e.g., Evening Gown, Casual Sun Dress, Power Suit) this accessory is perfectly suitable for and matches best.
           3. Suggest matching outfit colors and textures.
           4. Provide a "Better Choice" recommendation for an alternative accessory that could work for the same outfits.
           Return JSON with: style (the accessory style), dress (the perfectly suitable matching dress style), colors (array), occasions (array), tips (array), recommendation.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ inlineData: { mimeType: "image/jpeg", data: base64Data } }, { text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || "{}");
      setSuggestion(result);
      setStep(3);

      await addDoc(collection(db, 'wardrobe'), {
        userId: user.uid,
        imageUrl: image,
        type: stylingType,
        selectedStyle,
        ...result,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      setError("Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetFlow = () => {
    setImage(null);
    setSuggestion(null);
    setStep(1);
    setSelectedStyle(null);
    setStylingType(null);
    setSelectedOutfit(null);
    setView('home');
  };

  const deleteOutfit = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'wardrobe', id));
      setSelectedOutfit(null);
    } catch (err) {
      setError("Failed to delete outfit.");
    }
  };

  if (isAuthLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5] dark:bg-[#121212] transition-colors duration-500"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] dark:bg-[#121212] flex flex-col items-center justify-center p-6 transition-colors duration-500">
        <div className="absolute top-6 right-6">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-3 bg-gray-50 dark:bg-white/5 rounded-2xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm w-full space-y-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-100 dark:shadow-none">
              <Sparkles size={32} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight dark:text-white">StyleSwap</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Elevate your fashion with AI intelligence.</p>
          </div>

          <AnimatePresence mode="wait">
            {authMode === 'selection' ? (
              <motion.div key="selection" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
                <button onClick={handleGoogleSignIn} className="w-full bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-gray-50 dark:hover:bg-white/10 dark:text-white transition-all">
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  Continue with Google
                </button>
                <button onClick={() => setAuthMode('email-signin')} className="w-full bg-black dark:bg-white dark:text-black text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-gray-800 dark:hover:bg-gray-200 transition-all">
                  <Mail size={20} />
                  Continue with Email
                </button>
              </motion.div>
            ) : (
              <motion.form key="email" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={handleEmailAuth} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input type="email" placeholder="Email address" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white transition-all" />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white transition-all" />
                  </div>
                </div>
                <button type="submit" className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-semibold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 dark:shadow-none">
                  {authMode === 'email-signin' ? 'Sign In' : 'Create Account'}
                </button>
                <div className="flex justify-between text-sm">
                  <button type="button" onClick={() => setAuthMode(authMode === 'email-signin' ? 'email-signup' : 'email-signin')} className="text-emerald-600 font-medium">
                    {authMode === 'email-signin' ? 'Need an account?' : 'Already have an account?'}
                  </button>
                  <button type="button" onClick={() => setAuthMode('selection')} className="text-gray-400">Back</button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
          {error && <p className="text-red-500 text-xs text-center font-medium">{error}</p>}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-[#121212] text-[#1A1A1A] dark:text-white font-sans selection:bg-emerald-100 pb-24 transition-colors duration-500">
      <header className="fixed top-0 left-0 right-0 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 z-50 transition-colors duration-500">
        <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetFlow}>
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white"><Sparkles size={18} /></div>
            <h1 className="font-semibold text-lg tracking-tight">StyleSwap</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-gray-400 hover:text-emerald-500 transition-colors"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button 
              onClick={() => setView('settings')}
              className={`p-2 transition-colors ${view === 'settings' ? 'text-emerald-500' : 'text-gray-400'}`}
            >
              <UserIcon size={18} />
            </button>
            <button onClick={() => signOut(auth)} className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 rounded-full transition-colors"><LogOut size={18} /></button>
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-black/5 dark:border-white/10" alt="Profile" />
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto pt-24 px-6">
        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-3xl font-light leading-tight">Hello, <span className="font-medium">{user.displayName?.split(' ')[0]}</span></h2>
                <p className="text-gray-500 text-sm">What would you like to style today?</p>
              </div>

              <div className="grid gap-4">
                {[
                  { id: 'person', label: '1. Select a Person', icon: UserIcon, desc: 'Upload a photo of a person to style' },
                  { id: 'dress', label: '2. Select a Dress', icon: Shirt, desc: 'Style a specific clothing item' },
                  { id: 'accessory', label: '3. Select a Accessories', icon: Watch, desc: 'Find the perfect outfit for an accessory' }
                ].map((opt) => (
                  <button 
                    key={opt.id}
                    onClick={() => { setStylingType(opt.id as StylingType); setView('styling-flow'); setStep(1); }}
                    className="flex items-center gap-4 p-6 bg-white dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/10 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/5 transition-all text-left group"
                  >
                    <div className="w-12 h-12 bg-gray-50 dark:bg-white/5 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-colors">
                      <opt.icon size={24} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold dark:text-white">{opt.label}</h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{opt.desc}</p>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 group-hover:text-emerald-500" />
                  </button>
                ))}
              </div>

              {wardrobe.length > 0 && (
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold dark:text-white">Recent Wardrobe</h3>
                    <button onClick={() => setView('wardrobe')} className="text-xs font-bold text-emerald-600 uppercase tracking-wider">View All</button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                    {wardrobe.slice(0, 4).map((item) => (
                      <div key={item.id} className="flex-shrink-0 w-24 aspect-[3/4] rounded-xl overflow-hidden border border-black/5 dark:border-white/10">
                        <img src={item.imageUrl} className="w-full h-full object-cover" alt="Saved" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : view === 'styling-flow' ? (
            <motion.div key="flow" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <button onClick={() => setView('home')} className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm font-medium"><ChevronLeft size={16} /> Back to options</button>
              
              <div className="flex items-center gap-2 mb-4">
                {[1, 1.5, 2, 3].map((s) => (
                  <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${step >= s ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-white/10'}`} />
                ))}
              </div>

              {step === 1 && !isCameraOpen && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-semibold dark:text-white">Upload Image</h2>
                    <p className="text-gray-400 dark:text-gray-500 text-sm">Upload a photo of the {stylingType}</p>
                  </div>
                  <div onClick={() => fileInputRef.current?.click()} className="aspect-[4/5] bg-white dark:bg-white/5 rounded-3xl border-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-emerald-500 transition-all group">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-white/5 rounded-full flex items-center justify-center group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/10 transition-colors"><Upload className="text-gray-400 group-hover:text-emerald-600" /></div>
                    <p className="font-medium dark:text-white">Tap to upload</p>
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-4">Or</p>
                    <button 
                      onClick={startCamera}
                      className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 dark:shadow-none"
                    >
                      <Camera size={20} />
                      Open Camera
                    </button>
                  </div>
                </div>
              )}

              {step === 1 && isCameraOpen && (
                <div className="fixed inset-0 bg-black z-[100] flex flex-col">
                  <div className="p-6 flex justify-between items-center">
                    <button onClick={stopCamera} className="text-white p-2 bg-white/10 rounded-full"><X size={24} /></button>
                    <h3 className="text-white font-semibold">Take Photo</h3>
                    <div className="w-10" />
                  </div>
                  
                  <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>

                  <div className="p-12 flex items-center justify-center">
                    <button 
                      onClick={captureImage}
                      className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1"
                    >
                      <div className="w-full h-full bg-white rounded-full active:scale-90 transition-transform" />
                    </button>
                  </div>
                </div>
              )}

              {step === 1.5 && (
                <div className="flex flex-col items-center justify-center py-20 space-y-6">
                  <div className="relative w-32 h-32">
                    <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full" />
                    <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center text-emerald-500">
                      <Sparkles size={40} />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-semibold dark:text-white">Analyzing Image...</h2>
                    <p className="text-gray-400 dark:text-gray-500 text-sm">Gemini is identifying the content</p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-semibold dark:text-white">Select Style</h2>
                    <p className="text-gray-400 dark:text-gray-500 text-sm">Choose a fashion aesthetic</p>
                  </div>
                  <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar">
                    {Object.entries(STYLE_CATEGORIES).map(([category, styles]) => (
                      <div key={category} className="space-y-3">
                        <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{category}</h3>
                        <div className="grid gap-2">
                          {styles.map((style) => (
                            <button 
                              key={style}
                              onClick={() => setSelectedStyle(style)}
                              className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${selectedStyle === style ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-200 dark:shadow-none' : 'bg-white dark:bg-white/5 border-black/5 dark:border-white/10 hover:border-emerald-200 dark:hover:border-emerald-500/50'}`}
                            >
                              <span className="text-sm font-medium">{style}</span>
                              {selectedStyle === style && <Check size={16} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button 
                    disabled={!selectedStyle || isAnalyzing}
                    onClick={startStyling}
                    className="w-full bg-black dark:bg-white dark:text-black text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg"
                  >
                    {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                    {isAnalyzing ? 'Analyzing...' : 'Generate Styling'}
                  </button>
                </div>
              )}

              {step === 3 && suggestion && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="relative aspect-[4/5] rounded-3xl overflow-hidden shadow-2xl shadow-black/10">
                    <img src={image!} className="w-full h-full object-cover" alt="Original" />
                    <div className="absolute top-4 left-4 bg-white/90 dark:bg-black/80 backdrop-blur px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-black/5 dark:border-white/10 dark:text-white">
                      {stylingType} • {selectedStyle}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {suggestion.gender && (
                      <div className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/10 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Detected Gender</span>
                        <span className="font-semibold text-emerald-600">{suggestion.gender}</span>
                      </div>
                    )}

                    {suggestion.dress && (
                      <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-3">
                        <div className="flex items-center gap-2 text-emerald-600">
                          {stylingType === 'accessory' ? <Shirt size={18} /> : <Shirt size={18} />}
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {stylingType === 'accessory' ? 'Perfectly Suitable Dress Styles' : 'Suggested Outfit'}
                          </span>
                        </div>
                        <p className="text-lg font-semibold leading-tight dark:text-white">{suggestion.dress}</p>
                      </div>
                    )}

                    {suggestion.accessories && suggestion.accessories.length > 0 && (
                      <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-600"><Watch size={18} /><span className="text-xs font-bold uppercase tracking-wider">Accessories</span></div>
                        <div className="flex flex-wrap gap-2">
                          {suggestion.accessories.map((item, i) => (
                            <span key={i} className="px-3 py-1.5 bg-gray-50 dark:bg-white/5 rounded-full text-sm font-medium border border-black/5 dark:border-white/10 dark:text-gray-300">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {suggestion.recommendation && (
                      <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-6 rounded-3xl space-y-3">
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><Sparkles size={18} /><span className="text-xs font-bold uppercase tracking-wider">Better Choice</span></div>
                        <p className="text-emerald-900 dark:text-emerald-400 text-sm leading-relaxed font-medium">{suggestion.recommendation}</p>
                      </div>
                    )}

                    <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-4">
                      <div className="flex items-center gap-2 text-emerald-600"><Palette size={18} /><span className="text-xs font-bold uppercase tracking-wider">Color Palette</span></div>
                      <div className="flex gap-2">
                        {suggestion.colors?.map((color, i) => (
                          <div key={i} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/20 shadow-sm" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                    </div>

                    {suggestion.occasions && suggestion.occasions.length > 0 && (
                      <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-600"><Calendar size={18} /><span className="text-xs font-bold uppercase tracking-wider">Suitable Occasions</span></div>
                        <div className="flex flex-wrap gap-2">
                          {suggestion.occasions.map((item, i) => (
                            <span key={i} className="px-3 py-1.5 bg-gray-50 dark:bg-white/5 rounded-full text-sm font-medium border border-black/5 dark:border-white/10 dark:text-gray-300">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {suggestion.tips && suggestion.tips.length > 0 && (
                      <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-600"><Check size={18} /><span className="text-xs font-bold uppercase tracking-wider">Styling Tips</span></div>
                        <ul className="space-y-2">
                          {suggestion.tips.map((tip, i) => (
                            <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex gap-2">
                              <span className="text-emerald-500 font-bold">•</span>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button onClick={resetFlow} className="w-full py-4 rounded-2xl bg-black dark:bg-white dark:text-black text-white font-semibold transition-all shadow-lg">Done & Save to Wardrobe</button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : view === 'settings' ? (
            <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm font-medium cursor-pointer" onClick={() => setView('home')}>
                <ChevronLeft size={16} /> Back to home
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold dark:text-white">Settings</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Customize your StyleSwap experience.</p>
                </div>

                <div className="space-y-4 pt-4">
                  <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Account</h3>
                  <div className="bg-white dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/10 p-6 space-y-4">
                    <div className="flex items-center gap-4">
                      <img src={user.photoURL || ''} className="w-12 h-12 rounded-full border border-black/5 dark:border-white/10" alt="Profile" />
                      <div>
                        <p className="font-semibold dark:text-white">{user.displayName}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => signOut(auth)}
                      className="w-full py-3 rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-500 font-semibold text-sm hover:bg-red-100 transition-all"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="wardrobe" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold dark:text-white">Your Wardrobe</h2>
                <button onClick={() => setView('home')} className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Home</button>
              </div>

              {selectedOutfit ? (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                  <button onClick={() => setSelectedOutfit(null)} className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm font-medium"><ChevronLeft size={16} /> Back to wardrobe</button>
                  
                  <div className="relative aspect-[4/5] rounded-3xl overflow-hidden shadow-2xl shadow-black/10">
                    <img src={selectedOutfit.imageUrl} className="w-full h-full object-cover" alt="Saved Outfit" />
                    <div className="absolute top-4 left-4 bg-white/90 dark:bg-black/80 backdrop-blur px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-black/5 dark:border-white/10 dark:text-white">
                      {selectedOutfit.type} • {selectedOutfit.style}
                    </div>
                    <button 
                      onClick={() => deleteOutfit(selectedOutfit.id)}
                      className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {selectedOutfit.gender && (
                      <div className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/10 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Detected Gender</span>
                        <span className="font-semibold text-emerald-600">{selectedOutfit.gender}</span>
                      </div>
                    )}

                    {selectedOutfit.dress && (
                      <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-3">
                        <div className="flex items-center gap-2 text-emerald-600">
                          <Shirt size={18} />
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {selectedOutfit.type === 'accessory' ? 'Perfectly Suitable Dress Styles' : 'Suggested Outfit'}
                          </span>
                        </div>
                        <p className="text-lg font-semibold leading-tight dark:text-white">{selectedOutfit.dress}</p>
                      </div>
                    )}

                    {selectedOutfit.accessories && selectedOutfit.accessories.length > 0 && (
                      <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-600"><Watch size={18} /><span className="text-xs font-bold uppercase tracking-wider">Accessories</span></div>
                        <div className="flex flex-wrap gap-2">
                          {selectedOutfit.accessories.map((item, i) => (
                            <span key={i} className="px-3 py-1.5 bg-gray-50 dark:bg-white/5 rounded-full text-sm font-medium border border-black/5 dark:border-white/10 dark:text-gray-300">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedOutfit.recommendation && (
                      <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-6 rounded-3xl space-y-3">
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><Sparkles size={18} /><span className="text-xs font-bold uppercase tracking-wider">Better Choice</span></div>
                        <p className="text-emerald-900 dark:text-emerald-400 text-sm leading-relaxed font-medium">{selectedOutfit.recommendation}</p>
                      </div>
                    )}

                    <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-4">
                      <div className="flex items-center gap-2 text-emerald-600"><Palette size={18} /><span className="text-xs font-bold uppercase tracking-wider">Color Palette</span></div>
                      <div className="flex gap-2">
                        {selectedOutfit.colors?.map((color, i) => (
                          <div key={i} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/20 shadow-sm" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                    </div>

                    {selectedOutfit.occasions && selectedOutfit.occasions.length > 0 && (
                      <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-600"><Calendar size={18} /><span className="text-xs font-bold uppercase tracking-wider">Suitable Occasions</span></div>
                        <div className="flex flex-wrap gap-2">
                          {selectedOutfit.occasions.map((item, i) => (
                            <span key={i} className="px-3 py-1.5 bg-gray-50 dark:bg-white/5 rounded-full text-sm font-medium border border-black/5 dark:border-white/10 dark:text-gray-300">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedOutfit.tips && selectedOutfit.tips.length > 0 && (
                      <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/10 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-600"><Check size={18} /><span className="text-xs font-bold uppercase tracking-wider">Styling Tips</span></div>
                        <ul className="space-y-2">
                          {selectedOutfit.tips.map((tip, i) => (
                            <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex gap-2">
                              <span className="text-emerald-500 font-bold">•</span>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : wardrobe.length === 0 ? (
                <div className="text-center py-20 space-y-4">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-400"><Shirt size={32} /></div>
                  <p className="text-gray-500 dark:text-gray-400">Your wardrobe is empty. Start styling!</p>
                </div>
              ) : (
                <div className="space-y-8 pb-12">
                  {[
                    { id: 'person', label: '1. Person', icon: UserIcon },
                    { id: 'dress', label: '2. Dress', icon: Shirt },
                    { id: 'accessory', label: '3. Accessories', icon: Watch }
                  ].map((section) => {
                    const items = wardrobe.filter(item => item.type === section.id);
                    if (items.length === 0) return null;
                    
                    return (
                      <div key={section.id} className="space-y-4">
                        <div className="flex items-center gap-2 text-emerald-600">
                          <section.icon size={18} />
                          <h3 className="font-bold uppercase tracking-widest text-xs">{section.label}</h3>
                          <span className="text-[10px] bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-full font-bold">{items.length}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {items.map((item) => (
                            <div 
                              key={item.id} 
                              onClick={() => setSelectedOutfit(item)}
                              className="bg-white dark:bg-white/5 rounded-2xl overflow-hidden border border-black/5 dark:border-white/10 shadow-sm group cursor-pointer active:scale-95 transition-transform"
                            >
                              <div className="aspect-[3/4] relative">
                                <img src={item.imageUrl} className="w-full h-full object-cover" alt="Outfit" />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 text-center">
                                  <p className="text-white text-[10px] font-bold uppercase tracking-widest mb-2">{item.type}</p>
                                  <p className="text-white text-xs font-medium leading-tight">{item.style}</p>
                                </div>
                              </div>
                              <div className="p-3">
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-widest mb-1">{item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</p>
                                <p className="text-xs font-semibold truncate dark:text-white">{item.style}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#121212] border-t border-black/5 dark:border-white/5 px-6 py-4 z-50 transition-colors duration-500">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <button onClick={() => { setView('home'); setStylingType(null); }} className={`flex flex-col items-center gap-1 transition-colors ${view === 'home' || view === 'styling-flow' ? 'text-emerald-600' : 'text-gray-400 dark:text-gray-500'}`}>
            <ImageIcon size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Home</span>
          </button>
          <button 
            onClick={() => {
              if (!stylingType) setStylingType('person');
              startCamera();
            }} 
            className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 dark:shadow-none -mt-8 border-4 border-white dark:border-[#121212] active:scale-95 transition-transform"
          >
            <Camera size={24} />
          </button>
          <button onClick={() => setView('wardrobe')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'wardrobe' ? 'text-emerald-600' : 'text-gray-400 dark:text-gray-500'}`}>
            <History size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Wardrobe</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

import { useState, useEffect } from 'react';
import axios from 'axios';

interface Writeup {
  id: string;
  week: number;
  title: string;
  content: string;
  publish_at: string;
}

interface WriteupPopupProps {
  week: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function WriteupPopup({ week }: WriteupPopupProps) {
  const [writeup, setWriteup] = useState<Writeup | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    checkForWriteup();
  }, [week]);

  async function checkForWriteup() {
    // Check if user has dismissed this week's writeup
    const dismissedKey = `writeup-dismissed-${week}`;
    if (localStorage.getItem(dismissedKey)) {
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/api/public/writeup/${week}`);
      if (res.data.writeup) {
        setWriteup(res.data.writeup);
        setShowPopup(true);
      }
    } catch (err) {
      console.error('Failed to fetch writeup:', err);
    }
  }

  function handleDismiss() {
    const dismissedKey = `writeup-dismissed-${week}`;
    localStorage.setItem(dismissedKey, 'true');
    setShowPopup(false);
    setShowContent(false);
  }

  function handleView() {
    setShowContent(true);
  }

  if (!showPopup || !writeup) return null;

  // Show full content view
  if (showContent) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">{writeup.title}</h2>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6 overflow-y-auto flex-1">
            <div className="prose prose-invert prose-sm max-w-none">
              {writeup.content.split('\n').map((line, i) => {
                // Handle headers
                if (line.startsWith('### ')) {
                  return <h3 key={i} className="text-lg font-semibold text-amber-400 mt-4 mb-2">{line.slice(4)}</h3>;
                }
                if (line.startsWith('## ')) {
                  return <h2 key={i} className="text-xl font-bold text-white mt-6 mb-3">{line.slice(3)}</h2>;
                }
                if (line.startsWith('# ')) {
                  return <h1 key={i} className="text-2xl font-bold text-white mt-6 mb-3">{line.slice(2)}</h1>;
                }
                // Handle bullet points
                if (line.startsWith('- ') || line.startsWith('* ')) {
                  return (
                    <div key={i} className="flex gap-2 text-slate-300 ml-4 my-1">
                      <span className="text-amber-400">•</span>
                      <span>{line.slice(2)}</span>
                    </div>
                  );
                }
                // Handle bold text
                const boldParsed = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
                // Empty line = paragraph break
                if (line.trim() === '') {
                  return <div key={i} className="h-3" />;
                }
                return (
                  <p 
                    key={i} 
                    className="text-slate-300 my-2"
                    dangerouslySetInnerHTML={{ __html: boldParsed }}
                  />
                );
              })}
            </div>
          </div>
          
          {/* Footer */}
          <div className="p-4 border-t border-slate-700">
            <button
              onClick={handleDismiss}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show notification popup
  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 shadow-2xl shadow-amber-500/10 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold">{writeup.title}</h3>
            <p className="text-slate-400 text-sm mt-1">New weekly recap available</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleView}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg transition-colors"
              >
                View
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

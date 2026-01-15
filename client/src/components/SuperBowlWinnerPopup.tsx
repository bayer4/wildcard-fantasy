import { useState, useEffect } from 'react';

interface SuperBowlWinnerPopupProps {
  week: number;
  winnerName: string | null;
}

export default function SuperBowlWinnerPopup({ week, winnerName }: SuperBowlWinnerPopupProps) {
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    // Only show for Super Bowl (week 4) when there's a winner
    if (week !== 4 || !winnerName) {
      return;
    }

    // Check if user has already seen this
    const seenKey = `superbowl-winner-seen-${winnerName}`;
    if (localStorage.getItem(seenKey)) {
      return;
    }

    // Show the popup after a short delay for dramatic effect
    const timer = setTimeout(() => {
      setShowPopup(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [week, winnerName]);

  function handleDismiss() {
    if (winnerName) {
      localStorage.setItem(`superbowl-winner-seen-${winnerName}`, 'true');
    }
    setShowPopup(false);
  }

  if (!showPopup || !winnerName) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-amber-900/90 via-slate-900 to-amber-900/90 border-2 border-amber-500/50 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl shadow-amber-500/20 animate-slide-up">
        {/* Confetti-like top border */}
        <div className="h-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
        
        {/* Content */}
        <div className="p-6 text-center">
          {/* Trophy */}
          <div className="text-6xl mb-4">🏆</div>
          
          {/* Winner announcement */}
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300 mb-2">
            SUPER BOWL CHAMPIONS
          </h2>
          <p className="text-3xl font-black text-white mb-6">
            {winnerName}
          </p>
          
          {/* Commissioner image */}
          <div className="relative mx-auto w-40 h-40 rounded-full overflow-hidden border-4 border-amber-500/50 shadow-lg mb-4">
            <img 
              src="/commish.jpg" 
              alt="Commissioner"
              className="w-full h-full object-cover"
            />
          </div>
          
          {/* Message */}
          <p className="text-amber-200 text-lg italic mb-6">
            "Congrats on a great season!"
          </p>
          <p className="text-slate-400 text-sm mb-6">
            — The Commissioner
          </p>
          
          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="px-8 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold rounded-xl transition-all transform hover:scale-105 shadow-lg"
          >
            Claim Your Glory
          </button>
        </div>
        
        {/* Bottom border */}
        <div className="h-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
      </div>
    </div>
  );
}

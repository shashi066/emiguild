'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [isFlashbang, setIsFlashbang] = useState(false);
  const [jokeText, setJokeText] = useState("Real gamers don't use light mode.");
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isLightMode]);

  const handleToggle = () => {
    if (isFlashbang) return;
    
    // If already in light mode, just switch back immediately
    if (isLightMode) {
      setIsLightMode(false);
      return;
    }

    setIsFlashbang(true);
    setJokeText("Real gamers don't use light mode.");
    
    // Change text at 2.5 seconds
    setTimeout(() => {
      setJokeText("Just kidding... 🫣");
    }, 2500);

    // Swap to light mode *while* the screen is completely white (fade out starts at 85% of 4.5s = ~3.8s)
    setTimeout(() => {
      setIsLightMode(true);
    }, 3800);

    // End flashbang overlay completely at 4.5 seconds
    setTimeout(() => {
      setIsFlashbang(false);
    }, 4500);
  };

  return (
    <>
      <button 
        onClick={handleToggle}
        className={`theme-toggle ${isFlashbang || isLightMode ? 'is-light' : 'is-dark'}`}
        aria-label="Toggle Theme"
      >
        <div className="theme-toggle-track">
          <div className="theme-toggle-thumb">
            {(isFlashbang || isLightMode) ? <Sun size={12} className="sun-icon" /> : <Moon size={12} className="moon-icon" />}
          </div>
        </div>
      </button>

      {/* The Flashbang Overlay */}
      {isFlashbang && (
        <div className="flashbang-overlay">
          <div className="flashbang-text">
            <h2>FLASHBANG DEPLOYED</h2>
            <p className="flashbang-subtitle">{jokeText}</p>
          </div>
        </div>
      )}
    </>
  );
}

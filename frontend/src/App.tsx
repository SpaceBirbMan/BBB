import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import StartScreen from './pages/StartScreen';
import ModeSelect from './pages/ModeSelect';
import UploadPage from './pages/UploadPage';
import ViewerPage from './pages/ViewerPage';

const ThemeToggle = () => {
  const [isDark, setIsDark] = React.useState(false);

  useEffect(() => {
    // Default to light theme, remove dark class if strictly needed
    document.documentElement.classList.remove('dark');
  }, []);

  const toggle = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <button
      onClick={toggle}
      className="absolute top-4 right-4 p-2 rounded-full glass hover:bg-white/30 dark:hover:bg-black/30 transition-colors z-50 text-foreground"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun size={24} /> : <Moon size={24} />}
    </button>
  );
};

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center">
        <ThemeToggle />
        <Routes>
          <Route path="/" element={<StartScreen />} />
          <Route path="/mode" element={<ModeSelect />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/viewer" element={<ViewerPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

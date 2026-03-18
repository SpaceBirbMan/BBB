import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';

const StartScreen: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-1000">
      <div className="flex flex-col justify-center items-center text-center max-w-2xl px-6">
        <div className="bg-primary/10 p-4 rounded-full mb-6">
          <Activity size={48} className="text-primary" />
        </div>
        
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6">
          Добро пожаловать!
        </h1>
        
        <p className="text-xl md:text-2xl text-foreground/80 leading-relaxed mb-12">
          Программа помощник в определении <span className="text-primary font-semibold">дисплазии</span> тазобедренного сустава у детей
        </p>

        <button
          onClick={() => navigate('/mode')}
          className="bg-primary hover:bg-primary-hover text-white font-bold text-xl px-12 py-5 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:shadow-[0_0_30px_rgba(34,197,94,0.6)] transform hover:scale-105 transition-all duration-300"
        >
          Начать
        </button>
      </div>
    </div>
  );
};

export default StartScreen;

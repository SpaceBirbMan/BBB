import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setMode } from '../store/analysisSlice';
import clsx from 'clsx';

const ModeSelect: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSelect = (mode: 'doctor' | 'student') => {
    dispatch(setMode(mode));
    navigate('/upload');
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-6xl px-6 py-12 animate-in slide-in-from-bottom-8 duration-700">
      <div className="grid md:grid-cols-2 gap-8 md:gap-16 w-full relative">
        {/* Divider line for desktop */}
        <div className="hidden md:block absolute left-1/2 top-4 bottom-4 w-px bg-foreground/10 transform -translate-x-1/2"></div>

        {/* Teacher Mode */}
        <div className="flex flex-col items-center md:items-end text-center md:text-right space-y-8 p-6 md:pr-12">
          <div className="flex flex-col items-center md:items-end space-y-2">
            <h2 className="text-4xl font-bold flex flex-col items-center md:items-end">
              <span>Режим</span>
              <span className="text-secondary mt-1 flex items-center gap-3">
                врача
              </span>
            </h2>
          </div>

          <ul className="space-y-4 text-lg text-foreground/80 list-disc list-inside md:list-none text-left md:text-right">
            <li>Четкая информация</li>
            <li>Сухие данные</li>
            <li>Ничего лишнего</li>
            <li>Возможность редактирования</li>
          </ul>

          <button
            onClick={() => handleSelect('doctor')}
            className={clsx(
              "bg-secondary hover:bg-secondary-hover text-white font-bold text-xl px-12 py-4 rounded-full mt-4 w-full md:w-auto",
              "shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] transform hover:scale-105 transition-all duration-300"
            )}
          >
            Выбор
          </button>
        </div>

        {/* Student Mode */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-8 p-6 md:pl-12">
          <div className="flex flex-col items-center md:items-start space-y-2">
            <h2 className="text-4xl font-bold flex flex-col items-center md:items-start">
              <span>Режим</span>
              <span className="text-primary mt-1 flex items-center gap-3">
                студента
              </span>
            </h2>
          </div>

          <ul className="space-y-4 text-lg text-foreground/80 list-disc list-inside md:list-none text-left">
            <li>Подробная информация</li>
            <li>Наглядное объяснение с формулами</li>
            <li>Показ расчетов</li>
            <li>Возможность редактирования</li>
          </ul>

          <button
            onClick={() => handleSelect('student')}
            className={clsx(
              "bg-primary hover:bg-primary-hover text-white font-bold text-xl px-12 py-4 rounded-full mt-4 w-full md:w-auto",
              "shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:shadow-[0_0_30px_rgba(34,197,94,0.6)] transform hover:scale-105 transition-all duration-300"
            )}
          >
            Выбор
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModeSelect;

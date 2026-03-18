import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import clsx from 'clsx';

const MeasurementsPanel: React.FC = () => {
  const { measurements, diagnosis, abnormalParameters, thresholds } = useSelector((state: RootState) => state.medical);
  const { ageMonths, gender, mode } = useSelector((state: RootState) => state.analysis);

  if (!measurements || !diagnosis) return null;

  const formatDiag = (diag: string) => {
    switch(diag) {
      case 'normal': return 'Норма';
      case 'pre_subluxation': return 'I ст. предвывих';
      case 'subluxation': return 'II ст. подвывих';
      case 'dislocation': return 'III ст. вывих';
      default: return diag;
    }
  };

  const isAbnormal = (param: string) => abnormalParameters.includes(param);

  return (
    <div className="flex flex-col gap-6">
      
      {/* Patient Info Header */}
      <div className="flex justify-between items-center px-1">
        <h2 className="font-bold text-lg text-foreground/90">Результаты анализа</h2>
        <div className="text-xs glass px-3 py-1 rounded-full opacity-70 bg-primary/5 text-primary border border-primary/20">
          {gender === 'boy' ? 'Мальчик' : 'Девочка'}, {Math.floor((ageMonths || 0) / 12)}г {(ageMonths || 0) % 12}мес
        </div>
      </div>

      {/* Warning blocks */}
      {diagnosis.missing_points && diagnosis.missing_points.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-3 mb-4 text-sm font-medium">
          ⚠️ Следующие ключевые точки не найдены ИИ: {diagnosis.missing_points.join(", ")}
        </div>
      )}

      {/* Medical Text Report */}
      {diagnosis.report && (
        <div className="glass rounded-xl p-5 border border-primary/20 bg-black/5 dark:bg-white/5 shadow-sm mb-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-primary">Медицинское заключение</h3>
            <button 
              onClick={() => navigator.clipboard.writeText(diagnosis.report || '')} 
              className="text-xs px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors"
            >
              Скопировать текст
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80 opacity-90 font-medium select-all">
            {diagnosis.report}
          </p>
        </div>
      )}

      {/* Triad of Putti Diagnosis Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Левый сустав */}
        <div className={clsx("p-4 rounded-xl border transition-colors", diagnosis.left_details?.is_pathology ? "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400" : "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400")}>
          <div className="text-sm font-semibold opacity-80 mb-1">Левый сустав (Триада Путти)</div>
          <div className="text-xl font-bold mb-3">
            {diagnosis.left_details?.text || formatDiag(diagnosis.left)}
          </div>
          {diagnosis.left_details && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Скошенность крыши:</span>
                <span className="font-mono">{Math.round(diagnosis.left_details.alpha_score * 100)}%</span>
              </div>
              <div className="w-full bg-black/10 rounded-full h-1.5"><div className="bg-current h-1.5 rounded-full" style={{ width: `${diagnosis.left_details.alpha_score * 100}%` }}></div></div>

              <div className="flex justify-between">
                <span>Деформация дуг (Шентон/Кальве):</span>
                <span className="font-mono">{Math.round(diagnosis.left_details.curve_score * 100)}%</span>
              </div>
              <div className="w-full bg-black/10 rounded-full h-1.5"><div className="bg-current h-1.5 rounded-full" style={{ width: `${diagnosis.left_details.curve_score * 100}%` }}></div></div>

              <div className="flex justify-between">
                <span>Смещение в квадрант Перкина:</span>
                <span className="font-mono">{Math.round(diagnosis.left_details.quadrant_score * 100)}%</span>
              </div>
              <div className="w-full bg-black/10 rounded-full h-1.5"><div className="bg-current h-1.5 rounded-full" style={{ width: `${diagnosis.left_details.quadrant_score * 100}%` }}></div></div>
            </div>
          )}
        </div>

        {/* Правый сустав */}
        <div className={clsx("p-4 rounded-xl border transition-colors", diagnosis.right_details?.is_pathology ? "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400" : "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400")}>
          <div className="text-sm font-semibold opacity-80 mb-1">Правый сустав (Триада Путти)</div>
          <div className="text-xl font-bold mb-3">
            {diagnosis.right_details?.text || formatDiag(diagnosis.right)}
          </div>
          {diagnosis.right_details && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Скошенность крыши:</span>
                <span className="font-mono">{Math.round(diagnosis.right_details.alpha_score * 100)}%</span>
              </div>
              <div className="w-full bg-black/10 rounded-full h-1.5"><div className="bg-current h-1.5 rounded-full" style={{ width: `${diagnosis.right_details.alpha_score * 100}%` }}></div></div>

              <div className="flex justify-between">
                <span>Деформация дуг (Шентон/Кальве):</span>
                <span className="font-mono">{Math.round(diagnosis.right_details.curve_score * 100)}%</span>
              </div>
              <div className="w-full bg-black/10 rounded-full h-1.5"><div className="bg-current h-1.5 rounded-full" style={{ width: `${diagnosis.right_details.curve_score * 100}%` }}></div></div>

              <div className="flex justify-between">
                <span>Смещение в квадрант Перкина:</span>
                <span className="font-mono">{Math.round(diagnosis.right_details.quadrant_score * 100)}%</span>
              </div>
              <div className="w-full bg-black/10 rounded-full h-1.5"><div className="bg-current h-1.5 rounded-full" style={{ width: `${diagnosis.right_details.quadrant_score * 100}%` }}></div></div>
            </div>
          )}
        </div>
      </div>

      {/* Measurements Table */}
      <div className="glass rounded-xl overflow-hidden shadow-sm border border-foreground/5">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-foreground/5 text-sm uppercase tracking-wider text-foreground/70">
              <th className="p-4 font-medium">Параметр</th>
              <th className="p-4 font-medium">Левый</th>
              <th className="p-4 font-medium">Правый</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/5 font-medium">
            <tr>
              <td className="p-4 text-foreground/80">Ацетабулярный угол (α)</td>
              <td className={clsx("p-4 transition-colors", isAbnormal("acetabular_angle_left") ? "text-red-500 font-bold" : "text-foreground")}>
                {measurements.acetabular_angle_left}°
              </td>
              <td className={clsx("p-4 transition-colors", isAbnormal("acetabular_angle_right") ? "text-red-500 font-bold" : "text-foreground")}>
                {measurements.acetabular_angle_right}°
              </td>
            </tr>
            <tr>
              <td className="p-4 text-foreground/80">Дистанция d</td>
              <td className={clsx("p-4 transition-colors", isAbnormal("d_distance_left") ? "text-red-500 font-bold" : "text-foreground")}>
                {measurements.d_distance_left} мм
              </td>
              <td className={clsx("p-4 transition-colors", isAbnormal("d_distance_right") ? "text-red-500 font-bold" : "text-foreground")}>
                {measurements.d_distance_right} мм
              </td>
            </tr>
            <tr>
              <td className="p-4 text-foreground/80">Высота h</td>
              <td className={clsx("p-4 transition-colors", isAbnormal("h_distance_left") ? "text-red-500 font-bold" : "text-foreground")}>
                {measurements.h_distance_left} мм
              </td>
              <td className={clsx("p-4 transition-colors", isAbnormal("h_distance_right") ? "text-red-500 font-bold" : "text-foreground")}>
                {measurements.h_distance_right} мм
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Reference Norms for specific patient */}
      {thresholds && Object.keys(thresholds).length > 0 && (
        <div className="glass rounded-xl p-5 border border-primary/10 bg-primary/5">
          <h3 className="font-bold mb-3 text-sm uppercase tracking-wider text-primary flex items-center gap-2">
             {mode === 'student' ? 'Клинические ориентиры' : 'Нормы для данного пациента'}
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="flex flex-col">
              <span className="text-xs opacity-60">Угол (α) макс</span>
              <span className="font-bold text-lg">{thresholds.max_alpha}°</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs opacity-60">h (мин)</span>
              <span className="font-bold text-lg">{thresholds.min_h} мм</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs opacity-60">d (макс)</span>
              <span className="font-bold text-lg">{thresholds.max_d} мм</span>
            </div>
          </div>
          
          {mode === 'student' && (
            <div className="mt-6 border-t border-primary/10 pt-4">
              <h4 className="text-xs font-bold text-primary mb-2">Таблица возрастных норм (α-угол)</h4>
              <table className="w-full text-[10px] text-left">
                <thead>
                  <tr className="opacity-60 border-b border-primary/5">
                    <th className="pb-1">Возраст</th>
                    <th className="pb-1">Норма</th>
                    <th className="pb-1">Подозрение</th>
                  </tr>
                </thead>
                <tbody className="opacity-80">
                  <tr><td>0-3 мес</td><td>&lt; 30°</td><td>30-35°</td></tr>
                  <tr><td>3-6 мес</td><td>&lt; 25°</td><td>25-30°</td></tr>
                  <tr><td>6-12 мес</td><td>&lt; 22°</td><td>22-28°</td></tr>
                  <tr><td>&gt; 12 мес</td><td>&lt; 20°</td><td>20-25°</td></tr>
                </tbody>
              </table>
              <div className="mt-3 text-[10px] space-y-1 opacity-70">
                <p>• Линия Перкина: головка во внутреннем нижнем квадранте.</p>
                <p>• Линия Шентона: должна быть плавной и без разрывов.</p>
              </div>
            </div>
          )}
          
          <p className="mt-3 text-[10px] opacity-50 italic">
            *Нормы определены на основе стола возрастных порогов и пола ребенка.
          </p>
        </div>
      )}

    </div>
  );
};

export default MeasurementsPanel;

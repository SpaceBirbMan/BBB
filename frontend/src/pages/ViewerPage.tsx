import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import { setEditing, updateMeasurements, undoDraw, redoDraw, setVisibility } from '../store/medicalSlice';
import { setMode } from '../store/analysisSlice';
import type { AnnotationType } from '../store/medicalSlice';
import { setActiveTab, updateActiveTabContent, removeTab } from '../store/tabsSlice';
import { loadTab } from '../store/actions';
import { api } from '../services/api';
import ImageCanvas from '../components/ImageCanvas';
import MeasurementsPanel from '../components/MeasurementsPanel';
import { 
  ArrowLeft, Edit2, Check, Loader2, 
  PanelRightClose, PanelRightOpen,
  Maximize, Download, Printer, Plus,
  Undo, Redo, Eye, EyeOff, PenTool, Square, Heading, Activity, GraduationCap, X
} from 'lucide-react';
import html2canvas from 'html2canvas';

const ViewerPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  const analysisState = useSelector((state: RootState) => state.analysis);
  const medicalState = useSelector((state: RootState) => state.medical);
  const tabsState = useSelector((state: RootState) => state.tabs);
  
  const { imageBase64, imageWidth, imageHeight, pixelSpacing, warning, ageMonths, gender, mode } = analysisState;
  const { points, isEditing, diagnosis, visibility, history, historyIndex } = medicalState;
  
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  
  const [activeTool, setActiveTool] = useState<AnnotationType | null>(null);
  const [draftPoints, setDraftPoints] = useState<{x:number, y:number}[]>([]);
  
  const viewerRef = useRef<HTMLDivElement>(null);
  const recalculateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-sync current active tab if data changes
  React.useEffect(() => {
    if (tabsState.activeTabId) {
      dispatch(updateActiveTabContent({ analysis: analysisState, medical: medicalState }));
    }
  }, [points, isEditing, diagnosis, analysisState.mode, dispatch, tabsState.activeTabId]); // sync explicitly when significant data changes
  
  // Switch to another tab
  const handleTabSwitch = (tabId: string) => {
    if (tabId === tabsState.activeTabId) return;
    const targetTab = tabsState.tabs.find(t => t.id === tabId);
    if (!targetTab) return;
    dispatch(loadTab({ analysis: targetTab.analysis, medical: targetTab.medical }));
    dispatch(setActiveTab(tabId));
  };

  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const remaining = tabsState.tabs.filter(t => t.id !== tabId);
    dispatch(removeTab(tabId));
    if (remaining.length === 0) {
      navigate('/upload');
    } else if (tabId === tabsState.activeTabId) {
      const nextTab = remaining[remaining.length - 1];
      dispatch(loadTab({ analysis: nextTab.analysis, medical: nextTab.medical }));
      dispatch(setActiveTab(nextTab.id));
    }
  };

  const handlePointDragEnd = () => {
    if (!isEditing) return;
    
    if (recalculateTimerRef.current) {
      clearTimeout(recalculateTimerRef.current);
    }
    
    recalculateTimerRef.current = setTimeout(async () => {
      setIsRecalculating(true);
      try {
        const result = await api.recalculate({
          points,
          image_width: imageWidth || 512,
          image_height: imageHeight || 512,
          pixel_spacing: pixelSpacing || undefined,
          age_months: ageMonths || undefined,
          gender: gender || undefined
        });
        
        dispatch(updateMeasurements({
          measurements: result.measurements,
          diagnosis: result.diagnosis,
          abnormalParameters: result.abnormal_parameters,
          thresholds: result.thresholds
        }));
      } catch (err) {
        console.error("Failed to recalculate:", err);
      } finally {
        setIsRecalculating(false);
      }
    }, 500);
  };

  const toggleEdit = () => {
    dispatch(setEditing(!isEditing));
  };
  
  const handlePrint = () => {
    window.print();
  };
  
  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleSave = async () => {
    if (!viewerRef.current) return;
    
    const captureArea = viewerRef.current.querySelector('#viewer-canvas-capture') as HTMLElement;
    if (!captureArea) return;

    try {
      const canvas = await html2canvas(captureArea, {
        useCORS: true,
        backgroundColor: '#000000'
      });
      
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `hip_dysplasia_analysis_${new Date().getTime()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to save image with markup", err);
    }
  };

  if (!imageBase64) return null;

  return (
    <div ref={viewerRef} className="flex flex-col w-full h-screen overflow-hidden bg-background">
      {/* Navbar / Header - Игнорируется при печати */}
      <header className="glass px-6 py-4 flex items-center justify-between z-10 shrink-0 print:hidden">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/mode')}
            className="flex items-center gap-2 hover:bg-white/20 dark:hover:bg-black/20 p-2 rounded-lg transition-colors font-medium text-primary"
          >
            <ArrowLeft size={20} />
            <span className="hidden sm:inline">Назад</span>
          </button>
          
          <div className="h-6 w-px bg-foreground/20"></div>
          
          {/* Toolbar */}
          <div className="flex items-center gap-2">
             <button onClick={() => setIsPanelVisible(!isPanelVisible)} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors" title={isPanelVisible ? "Скрыть панель" : "Показать расчеты"}>
               {isPanelVisible ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
             </button>
             <button onClick={handleFullscreen} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors" title="Во весь экран">
               <Maximize size={20} />
             </button>
             <button onClick={handleSave} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors" title="Сохранить снимок">
               <Download size={20} />
             </button>
             <button onClick={handlePrint} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors" title="Печать отчета">
               <Printer size={20} />
             </button>
             <button onClick={() => dispatch(setVisibility({ showAiPoints: !visibility.showAiPoints, showAiLines: !visibility.showAiLines }))} className={`p-2 rounded-lg transition-colors ${!visibility.showAiLines ? 'bg-primary/20 text-primary' : 'hover:bg-black/5 dark:hover:bg-white/10'}`} title="Отображение нейронной разметки">
               {!visibility.showAiLines ? <EyeOff size={20} /> : <Eye size={20} />}
             </button>
             <button onClick={() => dispatch(setVisibility({ showCustom: !visibility.showCustom }))} className={`p-2 rounded-lg transition-colors ${!visibility.showCustom ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-black/5 dark:hover:bg-white/10'}`} title="Отображение ручной разметки">
               {!visibility.showCustom ? <EyeOff size={20} /> : <PenTool size={20} />}
             </button>

             <div className="h-6 w-px bg-foreground/20 ml-2"></div>

             <button 
               onClick={() => {
                 const nextMode = (mode || 'doctor') === 'doctor' ? 'student' : 'doctor';
                 dispatch(setMode(nextMode));
               }} 
               className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-medium ${
                 mode === 'student' 
                   ? 'bg-amber-500 text-white shadow-md' 
                   : 'glass hover:bg-white/20'
               }`}
               title={mode === 'student' ? "Включен режим студента" : "Включен режим врача"}
             >
               <GraduationCap size={18} />
               <span>{mode === 'student' ? 'Студент' : 'Врач'}</span>
             </button>

             {mode === 'student' && (
               <button 
                 onClick={() => {
                   dispatch(setVisibility({ showAiPoints: false, showAiLines: false, showCustom: false }));
                   dispatch(setEditing(false));
                   setActiveTool(null);
                 }}
                 className="ml-2 px-3 py-1.5 glass rounded-lg text-xs hover:bg-white/30 transition-colors"
               >
                 Скрыть все
               </button>
             )}
             
             {/* Вкладки снимков */}
             <div className="h-6 w-px bg-foreground/20 ml-2"></div>
             <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-1 ml-2 text-sm font-medium gap-1 overflow-x-auto max-w-[400px]">
                {tabsState.tabs.map((tab) => (
                  <button 
                    key={tab.id}
                    onClick={() => handleTabSwitch(tab.id)}
                    className={`px-3 py-1 shadow-sm rounded-md transition-colors truncate max-w-[120px] ${
                      tab.id === tabsState.activeTabId 
                        ? 'bg-white dark:bg-black text-foreground cursor-default' 
                        : 'hover:bg-white/50 text-foreground/70'
                    }`}
                    title={tab.title}
                  >
                    {tab.title}
                  </button>
                ))}
                
                <button onClick={() => navigate('/upload')} className="px-3 py-1 hover:text-primary transition-colors flex items-center gap-1 shrink-0">
                  <Plus size={14} /> Открыть ещё
                </button>
             </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4 mr-16 shrink-0"> {/* mr-16 to avoid theme toggle */}
          {isRecalculating && (
            <div className="flex items-center gap-2 text-primary text-sm font-medium animate-pulse">
              <Loader2 size={16} className="animate-spin" />
              <span>Перерасчет...</span>
            </div>
          )}
          
          <button
            onClick={toggleEdit}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              isEditing 
                ? 'bg-primary text-white shadow-lg' 
                : 'glass hover:bg-white/40 dark:hover:bg-black/40'
            }`}
          >
            {isEditing ? (
              <>
                <Check size={18} />
                <span>Готово</span>
              </>
            ) : (
              <>
                <Edit2 size={18} />
                <span>Редактировать точки</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-col flex-1 overflow-hidden p-4 gap-4 print:p-0">
        {warning && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 p-3 rounded-xl text-sm flex items-center justify-center gap-2 shrink-0 print:hidden">
            <span className="font-bold">⚠️</span>
            {warning}
          </div>
        )}
        
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden gap-4">
          
          {/* Инструментальная панель кастомного рисования */}
          <div className="w-14 items-center gap-4 shrink-0 glass rounded-2xl py-4 flex flex-col overflow-y-auto print:hidden shadow-lg border border-primary/10">
            {/* Undo / Redo */}
            <button onClick={() => dispatch(undoDraw())} disabled={historyIndex === 0} className="p-2 hover:bg-white/40 dark:hover:bg-black/40 rounded-lg text-foreground/70 disabled:opacity-30" title="Отменить">
              <Undo size={20} />
            </button>
            <button onClick={() => dispatch(redoDraw())} disabled={historyIndex === history.length - 1} className="p-2 hover:bg-white/40 dark:hover:bg-black/40 rounded-lg text-foreground/70 disabled:opacity-30" title="Повторить">
              <Redo size={20} />
            </button>

            <div className="w-8 h-px bg-foreground/20"></div>

            {/* Tools */}
            {[
              { id: 'calve', icon: <Activity size={20} />, title: "Линия Кальве (4 точки)" },
              { id: 'shenton', icon: <Activity size={20} />, title: "Линия Шентона (4 точки)" },
              { id: 'perkin', icon: <Heading size={20} />, title: "Линия Перкина (2 точки)" },
              { id: 'hilgenreiner', icon: <Heading size={20} className="rotate-90"/>, title: "Линия Хильгенрейнера (2 точки)" },
              { id: 'nucleus_left', icon: <Square size={20} />, title: "Левое ядро окостенения (Прямоугольник)" },
              { id: 'nucleus_right', icon: <Square size={20} />, title: "Правое ядро окостенения (Прямоугольник)" }
            ].map(tool => (
              <button 
                key={tool.id}
                onClick={() => { setActiveTool(activeTool === tool.id ? null : tool.id as AnnotationType); setDraftPoints([]); }}
                className={`p-2 rounded-lg transition-colors ${activeTool === tool.id ? 'bg-primary text-white shadow-md' : 'hover:bg-white/40 dark:hover:bg-black/40 text-foreground/70'}`}
                title={tool.title}
              >
                {tool.icon}
              </button>
            ))}
          </div>

          {/* Left: Interactive Canvas */}
          <div className="flex-1 rounded-2xl overflow-hidden glass shadow-lg flex flex-col relative print:shadow-none print:border-none">
            {isEditing && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-bold z-10 shadow-lg pointer-events-none animate-pulse print:hidden">
                Режим редактирования: перетащите точки
              </div>
            )}
            {activeTool && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-amber-500 text-white px-4 py-1 rounded-full text-sm font-bold z-10 shadow-lg pointer-events-none animate-pulse print:hidden">
                Рисование: {
                  activeTool.includes('nucleus') ? 'выделите область' : 
                  (activeTool === 'calve' || activeTool === 'shenton') ? `укажите 4 точки (${draftPoints.length}/4)` : 
                  `укажите 2 точки (${draftPoints.length}/2)`
                }
              </div>
            )}
            <ImageCanvas 
              onPointDragEnd={handlePointDragEnd} 
              activeTool={activeTool}
              setActiveTool={setActiveTool}
              draftPoints={draftPoints}
              setDraftPoints={setDraftPoints}
            />
          </div>

          {/* Right: Measurements Panel */}
          {isPanelVisible && (
            <div className="w-full md:w-[400px] lg:w-[450px] shrink-0 overflow-y-auto glass rounded-2xl p-6 shadow-lg print:shadow-none print:w-full print:h-auto print:overflow-visible print:border-t-2">
              <MeasurementsPanel />
            </div>
          )}
        </div>
      </main>
      
    </div>
  );
};

export default ViewerPage;

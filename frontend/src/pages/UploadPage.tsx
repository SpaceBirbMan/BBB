import React, { useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, UploadCloud, Loader2, Crop as CropIcon, RefreshCw } from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { setImageData, setLoading, setError, setPatientInfo } from '../store/analysisSlice';
import { setMedicalData } from '../store/medicalSlice';
import { addTab } from '../store/tabsSlice';
import { api } from '../services/api';

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  const [isConverting, setIsConverting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  
  // Crop and filter state
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [pixelSpacing, setPixelSpacing] = useState<[number, number] | null>(null);
  const [crop, setCrop] = useState<Crop>({ unit: 'px', width: 0, height: 0, x: 0, y: 0 });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [warning, setWarning] = useState<string | null>(null);
  const [patientYears, setPatientYears] = useState<number>(0);
  const [patientMonths, setPatientMonths] = useState<number>(6);
  const [gender, setGender] = useState<'boy' | 'girl'>('boy');
  const imgRef = useRef<HTMLImageElement>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    setIsConverting(true);
    setLocalError(null);

    try {
      const convertResult = await api.convertDicom(file);
      setImageToCrop(convertResult.image);
      setPixelSpacing(convertResult.pixel_spacing || null);
      setWarning(convertResult.warning || null);
    } catch (err: any) {
      console.error("Convert error:", err);
      const msg = err.response?.data?.detail || err.message || "Failed to convert DICOM file";
      setLocalError(msg);
      dispatch(setError(msg));
    } finally {
      setIsConverting(false);
    }
  }, [dispatch]);

  const handleRestartModules = async () => {
    setIsRestarting(true);
    try {
      await api.restartModules();
    } catch (err: any) {
      console.error("Restart error:", err);
    } finally {
      setIsRestarting(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      '*/*': []
    },
    multiple: false
  });

  const getCroppedImg = async (image: HTMLImageElement, cropData: PixelCrop): Promise<File> => {
    const canvas = document.createElement('canvas');
    const targetSize = 512;
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('No 2d context');

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    // Применяем те же фильтры, что и в UI, чтобы сохранить их в итоговом изображении
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    
    ctx.drawImage(
      image,
      cropData.x * scaleX,
      cropData.y * scaleY,
      cropData.width * scaleX,
      cropData.height * scaleY,
      0,
      0,
      targetSize,
      targetSize
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        resolve(new File([blob], "cropped_512.png", { type: "image/png" }));
      }, 'image/png');
    });
  };

  const handleAnalyze = async () => {
    if (!imgRef.current || !completedCrop) return;
    
    setIsUploading(true);
    setLocalError(null);
    dispatch(setLoading(true));

    try {
      // 2. Вырезаем 512x512 и отправляем на анализ
      const croppedFile = await getCroppedImg(imgRef.current, completedCrop);
      
      // Вычисляем скорректированный масштаб (pixel_spacing) для обрезанного изображения.
      let adjustedSpacing: [number, number] | undefined = undefined;
      if (pixelSpacing && imgRef.current) {
        const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
        const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
        const cropWidthOrig = completedCrop.width * scaleX;
        const cropHeightOrig = completedCrop.height * scaleY;

        adjustedSpacing = [
          pixelSpacing[0] * (cropHeightOrig / 512), // Row spacing (vertical)
          pixelSpacing[1] * (cropWidthOrig / 512)   // Col spacing (horizontal)
        ];
        
        console.log("[Upload] Original spacing:", pixelSpacing);
        console.log("[Upload] Crop width (orig px):", cropWidthOrig);
        console.log("[Upload] Adjusted spacing for 512px:", adjustedSpacing);
      } else {
        console.log("[Upload] No pixelSpacing available, using default scaling");
      }

      const totalMonths = (patientYears * 12) + patientMonths;
      const result = await api.uploadDicom(croppedFile, adjustedSpacing, totalMonths, gender);
      
      dispatch(setPatientInfo({ ageMonths: totalMonths, gender }));
      
      const newAnalysisState = {
        base64: result.image, // Corrected from imageBase64 to base64 for setImageData
        width: result.image_width,
        height: result.image_height,
        pixelSpacing: result.pixel_spacing || null,
        warning: result.warning || warning || null,
        abnormalParameters: result.abnormal_parameters,
        ageMonths: totalMonths,
        gender: gender,
        isLoading: false,
        error: null,
        mode: null as any
      };

      const newMedicalState = {
        points: result.points,
        measurements: result.measurements,
        diagnosis: result.diagnosis,
        abnormalParameters: result.abnormal_parameters,
        thresholds: result.thresholds,
        isEditing: false,
        customAnnotations: [],
        history: [[]],
        historyIndex: 0,
        visibility: {
          showAiPoints: true,
          showAiLines: true,
          showCustom: true
        }
      };

      dispatch(setImageData(newAnalysisState as any));
      dispatch(setMedicalData(newMedicalState));
      
      const tabId = Date.now().toString();
      dispatch(addTab({
        id: tabId,
        title: `Снимок ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
        analysis: { ...newAnalysisState, imageBase64: result.image, imageWidth: result.image_width, imageHeight: result.image_height },
        medical: newMedicalState
      }));

      navigate('/viewer');
    } catch (err: any) {
      console.error("Upload error:", err);
      const msg = err.response?.data?.detail || err.message || "Failed to process DICOM file";
      setLocalError(msg);
      dispatch(setError(msg));
    } finally {
      setIsUploading(false);
      dispatch(setLoading(false));
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen px-4 animate-in fade-in duration-500 overflow-y-auto">
      <div className="w-full max-w-6xl relative">
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-0 left-0 flex items-center gap-2 glass px-6 py-2 rounded-full hover:bg-white/40 dark:hover:bg-black/40 transition-colors font-medium z-10"
        >
          <ArrowLeft size={20} />
          Назад
        </button>

        <button 
          onClick={handleRestartModules}
          disabled={isRestarting}
          className="absolute top-0 right-0 flex items-center gap-2 px-4 py-2 opacity-30 hover:opacity-100 transition-opacity text-sm z-10"
          title="Перезапуск модулей нейросетей"
        >
          <RefreshCw size={16} className={isRestarting ? "animate-spin" : ""} />
        </button>

        {!imageToCrop ? (
          <div className="flex flex-col md:flex-row items-center justify-center gap-12 mt-20">
            <div className="md:w-1/3 text-center md:text-left">
              <h2 className="text-3xl font-bold mb-4">
                Перетяните <br/>рентгеновский снимок <br/>формата .dicom или <br/>выберите файл
              </h2>
              {localError && (
                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                  {localError}
                </div>
              )}
            </div>

            <div className="md:w-1/2 w-full max-w-md">
              <div 
                {...getRootProps()} 
                className={`
                  glass rounded-3xl p-12 flex flex-col items-center justify-center min-h-[400px] cursor-pointer
                  transition-all duration-300 border-2 border-dashed
                  ${isDragActive ? 'border-primary bg-primary/5 scale-105' : 'border-gray-300 dark:border-gray-600 hover:border-primary/50 hover:bg-white/40 dark:hover:bg-black/40'}
                  ${isConverting ? 'pointer-events-none opacity-80' : ''}
                `}
              >
                <input {...getInputProps()} />
                
                {isConverting ? (
                  <div className="flex flex-col items-center text-primary">
                    <Loader2 size={64} className="animate-spin mb-6" />
                    <p className="text-xl font-medium">Конвертация снимка...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-foreground/60">
                    <UploadCloud size={64} className="mb-6 opacity-50" />
                    <p className="text-xl font-medium mb-2">Выбрать файл</p>
                    <p className="text-sm">Рентгеновский снимок (DICOM или изображение)</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col border-none shadow-none items-center justify-center gap-8 mt-16 max-w-4xl mx-auto glass p-8 rounded-3xl">
             <div className="text-center">
               <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
                 <CropIcon className="text-primary" /> Выделите рабочую область
               </h2>
               <p className="text-foreground/70 mb-4">Область будет приведена к квадрату 1:1 перед анализом</p>
               {localError && (
                 <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                   {localError}
                 </div>
               )}
               {warning && !localError && (
                 <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-lg text-sm flex items-start gap-2 text-left">
                   <div className="font-bold">!</div>
                   {warning}
                 </div>
               )}
             </div>

             <div className="bg-black/5 dark:bg-black/20 p-4 rounded-xl w-full flex items-center justify-center overflow-auto">
               <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1}
                  keepSelection={true}
               >
                  <img 
                    ref={imgRef} 
                    src={imageToCrop} 
                    alt="Изображение для обрезки" 
                    className="max-w-full h-auto object-contain block"
                    style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)` }}
                    onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      const { width, height } = e.currentTarget;
                      const cropSize = Math.min(width, height) * 0.8;
                      
                      const newCrop: Crop = {
                        unit: 'px',
                        width: cropSize,
                        height: cropSize,
                        x: (width - cropSize) / 2,
                        y: (height - cropSize) / 2,
                      };
                      
                      setCrop(newCrop);
                      setCompletedCrop(newCrop as PixelCrop);
                    }}
                  />
               </ReactCrop>
             </div>

             <div className="w-full max-w-md flex flex-col gap-4 mt-2">
               <div className="flex flex-col gap-2">
                 <div className="flex justify-between text-sm font-medium">
                   <span>Яркость</span>
                   <span>{brightness}%</span>
                 </div>
                 <input 
                   type="range" 
                   min="50" max="200" value={brightness} 
                   onChange={(e) => setBrightness(Number(e.target.value))}
                   className="w-full accent-primary" 
                 />
               </div>
               <div className="flex flex-col gap-2">
                 <div className="flex justify-between text-sm font-medium">
                   <span>Контрастность</span>
                   <span>{contrast}%</span>
                 </div>
                 <input 
                   type="range" 
                   min="50" max="300" value={contrast} 
                   onChange={(e) => setContrast(Number(e.target.value))}
                   className="w-full accent-primary" 
                 />
               </div>
                <button 
                  onClick={() => { setBrightness(100); setContrast(100); }}
                  className="text-xs text-primary hover:underline self-end mt-1"
                >
                  Сбросить фильтры
                </button>
              </div>

              <div className="w-full max-w-md flex flex-col gap-4 mt-6 p-6 glass rounded-2xl border border-primary/20 bg-primary/5">
                <h3 className="font-bold text-lg mb-2 text-primary">Параметры пациента</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Возраст (лет)</label>
                    <input 
                      type="number" 
                      min="0" max="18" value={patientYears} 
                      onChange={(e) => setPatientYears(Math.max(0, parseInt(e.target.value) || 0))}
                      className="glass bg-white/50 dark:bg-black/50 p-2 rounded-lg border border-primary/30"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Месяцев</label>
                    <input 
                      type="number" 
                      min="0" max="11" value={patientMonths} 
                      onChange={(e) => setPatientMonths(Math.max(0, Math.min(11, parseInt(e.target.value) || 0)))}
                      className="glass bg-white/50 dark:bg-black/50 p-2 rounded-lg border border-primary/30"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Пол</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setGender('boy')}
                      className={`flex-1 py-2 rounded-lg font-medium transition-all ${gender === 'boy' ? 'bg-primary text-white shadow-md' : 'glass hover:bg-white/40'}`}
                    >
                      Мальчик
                    </button>
                    <button 
                      onClick={() => setGender('girl')}
                      className={`flex-1 py-2 rounded-lg font-medium transition-all ${gender === 'girl' ? 'bg-secondary text-white shadow-md' : 'glass hover:bg-white/40'}`}
                    >
                      Девочка
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-4">
                <button 
                  onClick={() => setImageToCrop(null)} 
                  className="px-6 py-3 rounded-xl font-medium glass hover:bg-white/40 transition-colors"
                  disabled={isUploading}
                >
                  Отмена
                </button>
                <button 
                  onClick={handleAnalyze} 
                  className="px-6 py-3 rounded-xl font-medium bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary-hover transition-colors flex items-center gap-2"
                  disabled={isUploading || !completedCrop?.width || !completedCrop?.height}
                >
                  {isUploading ? (
                    <><Loader2 size={20} className="animate-spin" /> Анализ...</>
                  ) : (
                    "Начать анализ"
                  )}
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadPage;


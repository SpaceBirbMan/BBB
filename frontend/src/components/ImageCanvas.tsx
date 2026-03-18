import React, { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import { updatePointPosition } from '../store/medicalSlice';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

import { addAnnotation } from '../store/medicalSlice';
import type { AnnotationType } from '../store/medicalSlice';

interface CanvasProps {
  onPointDragEnd: () => void;
  activeTool: AnnotationType | null;
  setActiveTool: (tool: AnnotationType | null) => void;
  draftPoints: { x: number, y: number }[];
  setDraftPoints: React.Dispatch<React.SetStateAction<{ x: number, y: number }[]>>;
}

const ImageCanvas: React.FC<CanvasProps> = ({
  onPointDragEnd, activeTool, setActiveTool, draftPoints, setDraftPoints
}) => {
  const dispatch = useDispatch();
  const containerRef = useRef<HTMLDivElement>(null);

  const { imageBase64, imageWidth, imageHeight, mode } = useSelector((state: RootState) => state.analysis);
  const { points, isEditing, measurements, visibility, customAnnotations } = useSelector((state: RootState) => state.medical);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);

  // Центрирование картинки при загрузке
  useEffect(() => {
    if (!imageBase64 || !containerRef.current || !imageWidth || !imageHeight) return;

    const container = containerRef.current;
    const containerRatio = container.clientWidth / container.clientHeight;
    const imgRatio = imageWidth / imageHeight;

    let initialScale = 1;
    if (imgRatio > containerRatio) {
      initialScale = container.clientWidth / imageWidth;
    } else {
      initialScale = container.clientHeight / imageHeight;
    }

    initialScale *= 0.9; // Небольшие отступы
    setScale(initialScale);

    setPosition({
      x: (container.clientWidth - imageWidth * initialScale) / 2,
      y: (container.clientHeight - imageHeight * initialScale) / 2
    });
  }, [imageBase64, imageWidth, imageHeight]);

  const handleWheel = (e: React.WheelEvent | WheelEvent) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = (e as WheelEvent).deltaY * -zoomSensitivity;
    let newScale = scale + delta;

    if (newScale < 0.1) newScale = 0.1;
    if (newScale > 10) newScale = 10;

    // Зум к центру контейнера, а не к мыши для простоты (или можно к мыши)
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const mouseX = (e as React.MouseEvent).clientX - rect.left;
      const mouseY = (e as React.MouseEvent).clientY - rect.top;

      const newX = mouseX - (mouseX - position.x) * (newScale / scale);
      const newY = mouseY - (mouseY - position.y) * (newScale / scale);

      setPosition({ x: newX, y: newY });
    }

    setScale(newScale);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel as any, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel as any);
    }
  }, [scale, position]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || !isEditing || (e.button === 0 && !draggingPointId && !(e.target as HTMLElement).closest('.point-marker'))) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    } else if (draggingPointId && isEditing && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Логические координаты
      const logicalX = (mouseX - position.x) / scale;
      const logicalY = (mouseY - position.y) / scale;

      dispatch(updatePointPosition({
        id: draggingPointId,
        x: Math.max(0, Math.min(imageWidth || 1000, Math.round(logicalX))),
        y: Math.max(0, Math.min(imageHeight || 1000, Math.round(logicalY)))
      }));
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsDragging(false);
    if (draggingPointId) {
      onPointDragEnd(); // Сохранение при отпускании точки
      setDraggingPointId(null);
      return;
    }

    // Если мы не тащили точку и инструмент активен - ставим точку для рисования
    if (activeTool && !isDragging && containerRef.current && dragStart.x === e.clientX - position.x && dragStart.y === e.clientY - position.y) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const logicalX = (mouseX - position.x) / scale;
      const logicalY = (mouseY - position.y) / scale;

      const newPts = [...draftPoints, { x: logicalX, y: logicalY }];
      setDraftPoints(newPts);

      // Проверяем, достаточно ли точек
      let requiredPoints = 2; // lines and rectangles
      if (activeTool === 'calve' || activeTool === 'shenton') requiredPoints = 4;

      if (newPts.length >= requiredPoints) {
        dispatch(addAnnotation({
          id: Date.now().toString(),
          type: activeTool,
          points: newPts
        }));
        setDraftPoints([]);
        setActiveTool(null);
      }
    }
  };

  const lineDescriptions: Record<string, { title: string, desc: string }> = {
    'hilgenreiner': { title: 'Линия Хильгенрейнера', desc: 'Проходит горизонтально через Y-образные хрящи. Служит базой для расчетов.' },
    'perkin': { title: 'Линия Перкина', desc: 'Перпендикуляр к линии Хильгенрейнера через верхне-наружный край вертлужной впадины.' },
    'acetabular': { title: 'Ацетабулярный угол', desc: 'Угол между линией Хильгенрейнера и касательной к крыше вертлужной впадины.' },
    'calve': { title: 'Линия Кальве', desc: 'Плавная дуга, проходящая по наружному краю крыла подвздошной кости и шейки бедра.' },
    'shenton': { title: 'Линия Шентона', desc: 'Кривая, соединяющая нижний край шейки бедра и верхний край запирательного отверстия.' },
    'hd': { title: 'Высота h и дистанция d', desc: 'h — вертикальное расстояние от головки до линии Х; d — расстояние от центра до дна впадины.' }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Helper для точек: индексируем по id И по name, чтобы работали оба типа поиска
  const pts: Record<string, any> = {};
  for (const p of points) {
    pts[p.id] = p;
    if (p.name) pts[p.name] = p;
  }

  const drawSmoothCurve = (ptList: any[]) => {
    const pts = ptList.filter(p => p?.x != null && p?.y != null);
    if (pts.length < 2) return null;
    if (pts.length === 2) {
      return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
    }

    const tension = 1 / 6; // стандартный коэффициент для Катмулл-Рома
    let d = `M ${pts[0].x},${pts[0].y}`;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];          // предыдущая или текущая (на старте)
      const p1 = pts[i];                                // старт сегмента
      const p2 = pts[i + 1];                            // конец сегмента
      const p3 = i + 2 < pts.length ? pts[i + 2] : p2; // следующая или конец (на финише)

      // Контрольные точки для кубической Безье
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  // Дуга с обрывом строго между верхними точками (idx 1 и 2) при наличии деформации (Шентона)
  const drawShentonCurve = (ptList: any[]) => {
    const validPts = ptList.filter(Boolean).filter(p => p.x > 0 || p.y > 0);
    if (validPts.length < 2) return { path: null, dashedPath: null };

    const extractPath = (pointsList: any[]) => {
      if (pointsList.length < 2) return null;
      if (pointsList.length === 2) return `M ${pointsList[0].x},${pointsList[0].y} L ${pointsList[1].x},${pointsList[1].y}`;
      let d = `M ${pointsList[0].x},${pointsList[0].y}`;
      for (let i = 0; i < pointsList.length - 1; i++) {
        const p0 = i === 0 ? pointsList[0] : pointsList[i - 1];
        const p1 = pointsList[i];
        const p2 = pointsList[i + 1];
        const p3 = i + 2 < pointsList.length ? pointsList[i + 2] : p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      }
      return d;
    };

    let needsBreak = false;
    let breakPos = 1; // строго между 1 и 2

    if (validPts.length >= 4) {
      // Проверяем угол излома
      const v1x = validPts[1].x - validPts[0].x;
      const v1y = validPts[1].y - validPts[0].y;
      const v2x = validPts[2].x - validPts[1].x;
      const v2y = validPts[2].y - validPts[1].y;

      const mag1 = Math.sqrt(v1x * v1x + v1y * v1y) || 1;
      const mag2 = Math.sqrt(v2x * v2x + v2y * v2y) || 1;
      const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)));
      const angle = Math.acos(dot) * (180 / Math.PI);

      if (angle > 60) {
        needsBreak = true;
      }
    }

    if (needsBreak) {
      const solidPath = extractPath(validPts.slice(0, breakPos + 1));

      const pA = validPts[breakPos - 1];
      const pB = validPts[breakPos];
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const mag = Math.sqrt(dx * dx + dy * dy) || 1;

      const distToNext = Math.sqrt(Math.pow(validPts[breakPos + 1].x - pB.x, 2) + Math.pow(validPts[breakPos + 1].y - pB.y, 2)) || 50;

      const exX = pB.x + (dx / mag) * distToNext;
      const exY = pB.y + (dy / mag) * distToNext;
      const dashedPath = `M ${pB.x},${pB.y} L ${exX},${exY}`;

      return { path: solidPath, dashedPath };
    }

    return { path: extractPath(validPts), dashedPath: null };
  };

  return (
    <div
      id="viewer-canvas-capture"
      ref={containerRef}
      className="w-full h-full relative overflow-hidden rounded-xl bg-black/5 dark:bg-black/20"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        cursor: isDragging ? 'grabbing' : (isEditing ? 'crosshair' : 'grab'),
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
    >
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          position: 'absolute',
          width: imageWidth ? `${imageWidth}px` : '100%',
          height: imageHeight ? `${imageHeight}px` : '100%',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        {/* Изображение */}
        {imageBase64 && (
          <img
            src={imageBase64}
            alt="Снимок пациента"
            draggable="false"
            style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
          />
        )}

        {/* SVG для отрисовки линий */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>

          {visibility.showAiLines && (
            <g className="ai-obj">
              {/* 1. Hilgenreiner line (purple dashed) passing through Y L and Y R (which are p3 and p4 now) */}
              {pts.p3 && pts.p4 && (() => {
                // Линия проходит через точки Y L (p3) и Y R (p4)
                const dx = pts.p4.x - pts.p3.x;
                const dy = pts.p4.y - pts.p3.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const extendDist = 2000;
                const dirX = length === 0 ? 1 : dx / length;
                const dirY = length === 0 ? 0 : dy / length;

                const startX = pts.p3.x - dirX * extendDist;
                const startY = pts.p3.y - dirY * extendDist;
                const endX = pts.p4.x + dirX * extendDist;
                const endY = pts.p4.y + dirY * extendDist;

                const px = dirY;
                const py = -dirX;

                const elements = [
                  <line key="hilgenreiner"
                    x1={startX} y1={startY}
                    x2={endX} y2={endY}
                    stroke="rgba(168, 85, 247, 0.7)"
                    strokeWidth={2 / scale} // Increased hit area
                    strokeDasharray={`${5 / scale}, ${5 / scale}`}
                    style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                    onMouseEnter={() => setHoveredLine('hilgenreiner')}
                    onMouseLeave={() => setHoveredLine(null)}
                  />
                ];

                // Perkin lines (perpendiculars through p1 and p2)
                if (pts.p1) {
                  elements.push(
                    <line key="perkin-l"
                      x1={pts.p1.x - px * extendDist} y1={pts.p1.y - py * extendDist}
                      x2={pts.p1.x + px * extendDist} y2={pts.p1.y + py * extendDist}
                      stroke="rgba(239, 68, 68, 0.6)" strokeWidth={2 / scale} strokeDasharray={`${5 / scale}, ${5 / scale}`}
                      style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                      onMouseEnter={() => setHoveredLine('perkin')}
                      onMouseLeave={() => setHoveredLine(null)}
                    />
                  );
                }
                if (pts.p2) {
                  elements.push(
                    <line key="perkin-r"
                      x1={pts.p2.x - px * extendDist} y1={pts.p2.y - py * extendDist}
                      x2={pts.p2.x + px * extendDist} y2={pts.p2.y + py * extendDist}
                      stroke="rgba(239, 68, 68, 0.6)" strokeWidth={2 / scale} strokeDasharray={`${5 / scale}, ${5 / scale}`}
                      style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                      onMouseEnter={() => setHoveredLine('perkin')}
                      onMouseLeave={() => setHoveredLine(null)}
                    />
                  );
                }
                return elements;
              })()}

              {/* 2. Acetabular angles (green) - connecting Y (p3/p4) to Roof (p1/p2) */}
              {pts.p3 && pts.p1 && (
                <React.Fragment>
                  <line x1={pts.p3.x} y1={pts.p3.y} x2={pts.p1.x} y2={pts.p1.y} stroke="rgba(34, 197, 94, 0.8)" strokeWidth={2 / scale}
                    style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                    onMouseEnter={() => setHoveredLine('acetabular')}
                    onMouseLeave={() => setHoveredLine(null)}
                  />
                  {measurements && (
                    <text x={(pts.p3.x + pts.p1.x) / 2 - 20 / scale} y={(pts.p3.y + pts.p1.y) / 2 - 10 / scale} fill="rgba(34, 197, 94, 1)" fontSize={16 / scale} fontWeight="bold" style={{ textShadow: '1px 1px 2px #000' }}>
                      α {measurements.acetabular_angle_left}°
                    </text>
                  )}
                </React.Fragment>
              )}
              {pts.p4 && pts.p2 && (
                <React.Fragment>
                  <line x1={pts.p4.x} y1={pts.p4.y} x2={pts.p2.x} y2={pts.p2.y} stroke="rgba(34, 197, 94, 0.8)" strokeWidth={2 / scale}
                    style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                    onMouseEnter={() => setHoveredLine('acetabular')}
                    onMouseLeave={() => setHoveredLine(null)}
                  />
                  {measurements && (
                    <text x={(pts.p4.x + pts.p2.x) / 2 + 10 / scale} y={(pts.p4.y + pts.p2.y) / 2 - 10 / scale} fill="rgba(34, 197, 94, 1)" fontSize={16 / scale} fontWeight="bold" style={{ textShadow: '1px 1px 2px #000' }}>
                      α {measurements.acetabular_angle_right}°
                    </text>
                  )}
                </React.Fragment>
              )}

              {/* 3. Distance h and d projections */}
              {pts.p3 && pts.p4 && (pts.p5 || pts.p6) && (() => {
                const dx = pts.p4.x - pts.p3.x;
                const dy = pts.p4.y - pts.p3.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length === 0) return null;

                const ux = dx / length;
                const uy = dy / length;

                const elements = [];

                // Left Side h & d
                if (pts.p5) {
                  const v5x = pts.p5.x - pts.p3.x;
                  const v5y = pts.p5.y - pts.p3.y;
                  const d_projL = v5x * ux + v5y * uy;

                  const intL_x = pts.p3.x + d_projL * ux;
                  const intL_y = pts.p3.y + d_projL * uy;

                  elements.push(
                    <React.Fragment key="left-hd">
                      {/* h distance line (perpendicular) */}
                      <line x1={intL_x} y1={intL_y} x2={pts.p5.x} y2={pts.p5.y} stroke="rgba(56, 189, 248, 0.8)" strokeWidth={2 / scale} />
                      {/* d distance line (along hilgenreiner) */}
                      <line x1={pts.p3.x} y1={pts.p3.y} x2={intL_x} y2={intL_y} stroke="rgba(250, 204, 21, 0.8)" strokeWidth={4 / scale} />

                      {measurements && (
                        <>
                          <text x={intL_x - 30 / scale} y={(intL_y + pts.p5.y) / 2} fill="rgba(56, 189, 248, 1)" fontSize={14 / scale} fontWeight="bold" style={{ textShadow: '1px 1px 2px #000' }}>
                            h={measurements.h_distance_left}
                          </text>
                          <text x={(pts.p3.x + intL_x) / 2} y={intL_y + 15 / scale} fill="rgba(250, 204, 21, 1)" fontSize={14 / scale} fontWeight="bold" style={{ textShadow: '1px 1px 2px #000', textAnchor: 'middle' }}>
                            d={measurements.d_distance_left}
                          </text>
                        </>
                      )}
                    </React.Fragment>
                  );
                }
                // Right Side h & d
                if (pts.p6) {
                  const v6x = pts.p6.x - pts.p4.x;
                  const v6y = pts.p6.y - pts.p4.y;
                  const d_projR = v6x * ux + v6y * uy;

                  const intR_x = pts.p4.x + d_projR * ux;
                  const intR_y = pts.p4.y + d_projR * uy;

                  elements.push(
                    <React.Fragment key="right-hd">
                      {/* h distance line (perpendicular) */}
                      <line x1={intR_x} y1={intR_y} x2={pts.p6.x} y2={pts.p6.y} stroke="rgba(56, 189, 248, 0.8)" strokeWidth={2 / scale} />
                      {/* d distance line (along hilgenreiner) */}
                      <line x1={pts.p4.x} y1={pts.p4.y} x2={intR_x} y2={intR_y} stroke="rgba(250, 204, 21, 0.8)" strokeWidth={4 / scale} />

                      {measurements && (
                        <>
                          <text x={intR_x + 10 / scale} y={(intR_y + pts.p6.y) / 2} fill="rgba(56, 189, 248, 1)" fontSize={14 / scale} fontWeight="bold" style={{ textShadow: '1px 1px 2px #000' }}>
                            h={measurements.h_distance_right}
                          </text>
                          <text x={(pts.p4.x + intR_x) / 2} y={intR_y + 15 / scale} fill="rgba(250, 204, 21, 1)" fontSize={14 / scale} fontWeight="bold" style={{ textShadow: '1px 1px 2px #000', textAnchor: 'middle' }}>
                            d={measurements.d_distance_right}
                          </text>
                        </>
                      )}
                    </React.Fragment>
                  );
                }
                return elements;
              })()}

              {/* 4. Линии Кальве (гладкие дуги строго без перерывов) */}
              {(() => {
                const listL = ["ТВ-Л", "ТБ-Л", "БВК-Л", "ББК-Л"].map(id => pts[id]);
                const listR = ["ТВ-П", "ТБ-П", "БВК-П", "ББК-П"].map(id => pts[id]);
                const pathL = drawSmoothCurve(listL);
                const pathR = drawSmoothCurve(listR);
                return (
                  <>
                    {pathL && <path d={pathL} fill="none" stroke="rgba(249, 115, 22, 0.8)" strokeWidth={2 / scale}  // Increased hit area
                      style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                      onMouseEnter={() => setHoveredLine('calve')}
                      onMouseLeave={() => setHoveredLine(null)}
                    />}
                    {pathR && <path d={pathR} fill="none" stroke="rgba(249, 115, 22, 0.8)" strokeWidth={2 / scale}
                      style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                      onMouseEnter={() => setHoveredLine('calve')}
                      onMouseLeave={() => setHoveredLine(null)}
                    />}
                  </>
                );
              })()}

              {/* 5. Линии Шентона (с возможным разрывом между верхними точками) */}
              {(() => {
                const listL = ["ШН-Л", "ШЛВ-Л", "ШПВ-Л", "ШП-Л"].map(id => pts[id]);
                const listR = ["ШЛ-П", "ШЛВ-П", "ШПВ-П", "ШН-П"].map(id => pts[id]);
                const l = drawShentonCurve(listL);
                const r = drawShentonCurve(listR);
                return (
                  <>
                    {l.path && <path d={l.path} fill="none" stroke="rgba(14, 165, 233, 0.8)" strokeWidth={2 / scale}
                      style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                      onMouseEnter={() => setHoveredLine('shenton')}
                      onMouseLeave={() => setHoveredLine(null)}
                    />}
                    {l.dashedPath && <path d={l.dashedPath} fill="none" stroke="rgba(14, 165, 233, 0.6)" strokeWidth={2 / scale} strokeDasharray={`${5 / scale}, ${5 / scale}`}
                      style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                      onMouseEnter={() => setHoveredLine('shenton')}
                      onMouseLeave={() => setHoveredLine(null)}
                    />}

                    {r.path && <path d={r.path} fill="none" stroke="rgba(14, 165, 233, 0.8)" strokeWidth={10 / scale}
                      style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                      onMouseEnter={() => setHoveredLine('shenton')}
                      onMouseLeave={() => setHoveredLine(null)}
                    />}
                    {r.dashedPath && <path d={r.dashedPath} fill="none" stroke="rgba(14, 165, 233, 0.6)" strokeWidth={10 / scale} strokeDasharray={`${5 / scale}, ${5 / scale}`}
                      style={{ pointerEvents: mode === 'student' ? 'auto' : 'none', cursor: 'help' }}
                      onMouseEnter={() => setHoveredLine('shenton')}
                      onMouseLeave={() => setHoveredLine(null)}
                    />}
                  </>
                );
              })()}
            </g>
          )}

          {/* Custom Annotations */}
          {visibility.showCustom && customAnnotations.map(anno => (
            <g key={anno.id} className="custom-annotation">
              {anno.type === 'calve' && drawSmoothCurve(anno.points) && <path d={drawSmoothCurve(anno.points)!} fill="none" stroke="rgba(249, 115, 22, 1)" strokeWidth={2 / scale} />}
              {anno.type === 'shenton' && drawShentonCurve(anno.points).path && <path d={drawShentonCurve(anno.points).path!} fill="none" stroke="rgba(14, 165, 233, 1)" strokeWidth={2 / scale} />}
              {anno.type === 'perkin' && anno.points.length === 2 && <line x1={anno.points[0].x} y1={anno.points[0].y} x2={anno.points[1].x} y2={anno.points[1].y} stroke="rgba(239, 68, 68, 1)" strokeWidth={2 / scale} />}
              {anno.type === 'hilgenreiner' && anno.points.length === 2 && <line x1={anno.points[0].x} y1={anno.points[0].y} x2={anno.points[1].x} y2={anno.points[1].y} stroke="rgba(168, 85, 247, 1)" strokeWidth={2 / scale} />}
              {(anno.type === 'nucleus_left' || anno.type === 'nucleus_right') && anno.points.length === 2 && (
                <rect
                  x={Math.min(anno.points[0].x, anno.points[1].x)} y={Math.min(anno.points[0].y, anno.points[1].y)}
                  width={Math.abs(anno.points[1].x - anno.points[0].x)} height={Math.abs(anno.points[1].y - anno.points[0].y)}
                  fill="rgba(56, 189, 248, 0.2)" stroke="rgba(56, 189, 248, 1)" strokeWidth={2 / scale}
                />
              )}
            </g>
          ))}

          {/* Draft Annotation Rendering */}
          {activeTool && draftPoints.length > 0 && (
            <g className="draft-annotation" opacity="0.6">
              {draftPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={5 / scale} fill="#facc15" />
              ))}
              {activeTool === 'calve' && draftPoints.length > 1 && <path d={drawSmoothCurve(draftPoints)!} fill="none" stroke="#facc15" strokeWidth={3 / scale} strokeDasharray="4,4" />}
              {activeTool === 'shenton' && draftPoints.length > 1 && <path d={drawShentonCurve(draftPoints).path!} fill="none" stroke="#facc15" strokeWidth={3 / scale} strokeDasharray="4,4" />}
              {(activeTool === 'perkin' || activeTool === 'hilgenreiner') && draftPoints.length === 2 && <line x1={draftPoints[0].x} y1={draftPoints[0].y} x2={draftPoints[1].x} y2={draftPoints[1].y} stroke="#facc15" strokeWidth={3 / scale} strokeDasharray="4,4" />}
              {(activeTool === 'nucleus_left' || activeTool === 'nucleus_right') && draftPoints.length === 2 && (
                <rect
                  x={Math.min(draftPoints[0].x, draftPoints[1].x)} y={Math.min(draftPoints[0].y, draftPoints[1].y)}
                  width={Math.abs(draftPoints[1].x - draftPoints[0].x)} height={Math.abs(draftPoints[1].y - draftPoints[0].y)}
                  fill="rgba(250, 204, 21, 0.2)" stroke="#facc15" strokeWidth={2 / scale} strokeDasharray="4,4"
                />
              )}
            </g>
          )}

        </svg>

        {/* Точки разметки */}
        {visibility.showAiPoints && points.filter(p => p.x > 15 || p.y > 15).map(point => {
          const isDraggingThis = draggingPointId === point.id;

          return (
            <React.Fragment key={point.id}>
              {/* Невидимая область для легкого клика по точке */}
              <div
                className="point-marker"
                style={{
                  position: 'absolute',
                  left: `${point.x}px`,
                  top: `${point.y}px`,
                  width: `${30 / scale}px`,
                  height: `${30 / scale}px`,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  cursor: isEditing ? 'grab' : 'default',
                  zIndex: isDraggingThis ? 20 : 10,
                  pointerEvents: isEditing ? 'auto' : 'none'
                }}
                onMouseDown={(e) => {
                  if (e.button === 0 && isEditing) {
                    e.stopPropagation();
                    setDraggingPointId(point.id);
                  }
                }}
              >
                {/* Видимая точка */}
                <div style={{
                  position: 'absolute',
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: `${12 / scale}px`,
                  height: `${12 / scale}px`,
                  background: isDraggingThis ? '#facc15' : '#22c55e',
                  border: `${2 / scale}px solid #fff`,
                  borderRadius: '50%',
                  boxShadow: isDraggingThis ? '0 0 10px #facc15' : '0 0 5px rgba(0,0,0,0.5)'
                }} />
              </div>

            </React.Fragment>
          );
        })}
      </div>

      {/* Tooltip for Student Mode */}
      {mode === 'student' && hoveredLine && lineDescriptions[hoveredLine] && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 glass p-4 rounded-xl z-[60] shadow-2xl border border-primary/30 max-w-xs animate-in slide-in-from-top-4 duration-300">
          <h4 className="font-bold text-primary mb-1">{lineDescriptions[hoveredLine].title}</h4>
          <p className="text-sm text-foreground/80 leading-relaxed">{lineDescriptions[hoveredLine].desc}</p>
        </div>
      )}

      {/* Инструменты масштаба (в стиле присланного UI) */}
      <div data-html2canvas-ignore="true" className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full flex gap-4 text-white z-50">
        <button
          className="hover:text-primary transition-colors"
          onClick={() => setScale(s => Math.max(0.1, s - 0.2))}
          title="Отдалить"
        >
          <ZoomOut size={20} />
        </button>
        <span className="font-mono flex items-center min-w-[50px] justify-center text-sm">
          {Math.round(scale * 100)}%
        </span>
        <button
          className="hover:text-primary transition-colors"
          onClick={() => setScale(s => Math.min(10, s + 0.2))}
          title="Приблизить"
        >
          <ZoomIn size={20} />
        </button>
        <div className="w-px bg-white/20 mx-1"></div>
        <button
          className="hover:text-primary transition-colors flex items-center gap-2 text-sm"
          onClick={toggleFullscreen}
          title="Во весь экран"
        >
          <Maximize size={18} />
          <span className="hidden sm:inline">Во весь экран</span>
        </button>
      </div>
    </div>
  );
};

export default ImageCanvas;

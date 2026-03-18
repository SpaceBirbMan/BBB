import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { loadTab } from './actions';

export interface Point {
  id: string;
  name?: string;
  x: number;
  y: number;
}

export interface Measurements {
  acetabular_angle_left: number;
  acetabular_angle_right: number;
  h_distance_left: number;
  h_distance_right: number;
  d_distance_left: number;
  d_distance_right: number;
}

export interface DiagnosisDetails {
  alpha_score: number;
  quadrant_score: number;
  curve_score: number;
  is_pathology: boolean;
  text: string;
}

export interface Diagnosis {
  left: string;
  right: string;
  left_details?: DiagnosisDetails;
  right_details?: DiagnosisDetails;
  report?: string;
  missing_points?: string[];
}

export type AnnotationType = 'calve' | 'shenton' | 'perkin' | 'hilgenreiner' | 'nucleus_left' | 'nucleus_right';

export interface Annotation {
  id: string;
  type: AnnotationType;
  points: {x: number, y: number}[];
}

interface MedicalState {
  points: Point[];
  measurements: Measurements | null;
  diagnosis: Diagnosis | null;
  abnormalParameters: string[];
  thresholds: Record<string, number>;
  isEditing: boolean;
  
  // Custom drawing and settings
  customAnnotations: Annotation[];
  history: Annotation[][]; // for undo/redo
  historyIndex: number;
  visibility: {
    showAiPoints: boolean;
    showAiLines: boolean;
    showCustom: boolean;
  };
}

const initialState: MedicalState = {
  points: [],
  measurements: null,
  diagnosis: null,
  abnormalParameters: [],
  thresholds: {},
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

const medicalSlice = createSlice({
  name: 'medical',
  initialState,
  reducers: {
    setMedicalData: (state, action: PayloadAction<{ 
      points: Point[]; 
      measurements: Measurements; 
      diagnosis: Diagnosis; 
      abnormalParameters?: string[];
      thresholds?: Record<string, number>;
    }>) => {
      state.points = action.payload.points;
      state.measurements = action.payload.measurements;
      state.diagnosis = action.payload.diagnosis;
      state.abnormalParameters = action.payload.abnormalParameters || [];
      state.thresholds = action.payload.thresholds || {};
    },
    updatePointPosition: (state, action: PayloadAction<{ id: string; x: number; y: number }>) => {
      const point = state.points.find(p => p.id === action.payload.id);
      if (point) {
        point.x = action.payload.x;
        point.y = action.payload.y;
      }
    },
    setEditing: (state, action: PayloadAction<boolean>) => {
      state.isEditing = action.payload;
    },
    updateMeasurements: (state, action: PayloadAction<{ 
      measurements: Measurements; 
      diagnosis: Diagnosis; 
      abnormalParameters?: string[];
      thresholds?: Record<string, number>;
    }>) => {
      state.measurements = action.payload.measurements;
      state.diagnosis = action.payload.diagnosis;
      state.abnormalParameters = action.payload.abnormalParameters || [];
      state.thresholds = action.payload.thresholds || {};
    },
    
    // Annotations and Undo/Redo Engine
    addAnnotation: (state, action: PayloadAction<Annotation>) => {
      // Create new history snapshot
      const newAnnotations = [...state.customAnnotations, action.payload];
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(newAnnotations);
      state.historyIndex = state.history.length - 1;
      state.customAnnotations = newAnnotations;
    },
    undoDraw: (state) => {
      if (state.historyIndex > 0) {
        state.historyIndex -= 1;
        state.customAnnotations = state.history[state.historyIndex];
      }
    },
    redoDraw: (state) => {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex += 1;
        state.customAnnotations = state.history[state.historyIndex];
      }
    },
    clearAnnotations: (state) => {
      const newAnnotations: Annotation[] = [];
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(newAnnotations);
      state.historyIndex = state.history.length - 1;
      state.customAnnotations = newAnnotations;
    },
    setVisibility: (state, action: PayloadAction<Partial<MedicalState['visibility']>>) => {
      state.visibility = { ...state.visibility, ...action.payload };
    },
    
    resetMedical: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(loadTab, (state, action) => {
      if (action.payload.medical) {
        return { ...initialState, ...action.payload.medical };
      }
      return state;
    });
  }
});

export const { 
  setMedicalData, updatePointPosition, setEditing, updateMeasurements, 
  addAnnotation, undoDraw, redoDraw, clearAnnotations, setVisibility,
  resetMedical 
} = medicalSlice.actions;
export default medicalSlice.reducer;

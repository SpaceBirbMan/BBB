import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { loadTab } from './actions';

interface AnalysisState {
  imageBase64: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  pixelSpacing: [number, number] | null;
  warning: string | null;
  ageMonths: number | null;
  gender: string | null;
  abnormalParameters: string[];
  isLoading: boolean;
  error: string | null;
  mode: 'doctor' | 'student' | null;
}

const initialState: AnalysisState = {
  imageBase64: null,
  imageWidth: null,
  imageHeight: null,
  pixelSpacing: null,
  warning: null,
  ageMonths: null,
  gender: null,
  abnormalParameters: [],
  isLoading: false,
  error: null,
  mode: null,
};

const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setMode: (state, action: PayloadAction<'doctor' | 'student'>) => {
      state.mode = action.payload;
    },
    setPatientInfo: (state, action: PayloadAction<{ ageMonths: number; gender: string }>) => {
      state.ageMonths = action.payload.ageMonths;
      state.gender = action.payload.gender;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
      if (action.payload) state.error = null;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    setImageData: (state, action: PayloadAction<{ 
      base64: string; 
      width: number; 
      height: number; 
      pixelSpacing?: [number, number] | null;
      warning?: string | null;
      abnormalParameters?: string[];
    }>) => {
      state.imageBase64 = action.payload.base64;
      state.imageWidth = action.payload.width;
      state.imageHeight = action.payload.height;
      state.pixelSpacing = action.payload.pixelSpacing || null;
      state.warning = action.payload.warning || null;
      state.abnormalParameters = action.payload.abnormalParameters || [];
      state.isLoading = false;
      state.error = null;
    },
    resetAnalysis: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(loadTab, (state, action) => {
      if (action.payload.analysis) {
        return { ...initialState, ...action.payload.analysis };
      }
      return state;
    });
  }
});

export const { 
  setMode, 
  setPatientInfo, 
  setLoading, 
  setError, 
  setImageData, 
  resetAnalysis 
} = analysisSlice.actions;

export default analysisSlice.reducer;

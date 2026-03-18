import axios from 'axios';
import type { Point, Measurements, Diagnosis } from '../store/medicalSlice';

// Vite proxy resolves this to http://localhost:8000
const API_URL = '/api';

export interface UploadResponse {
  image: string;
  points: Point[];
  measurements: Measurements;
  diagnosis: Diagnosis;
  image_width: number;
  image_height: number;
  pixel_spacing?: [number, number];
  warning?: string;
  abnormal_parameters?: string[];
  thresholds?: Record<string, number>;
}

export interface RecalculateRequest {
  points: Point[];
  image_width?: number;
  image_height?: number;
  pixel_spacing?: [number, number];
  age_months?: number;
  gender?: string;
}

export interface RecalculateResponse {
  measurements: Measurements;
  diagnosis: Diagnosis;
  abnormal_parameters?: string[];
  thresholds?: Record<string, number>;
}

export interface ConvertResponse {
  image: string;
  pixel_spacing?: [number, number];
  warning?: string;
}


export const api = {
  uploadDicom: async (
    file: File, 
    pixelSpacing?: [number, number], 
    ageMonths?: number, 
    gender?: string
  ): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (pixelSpacing) {
      formData.append('pixel_spacing', `${pixelSpacing[0]},${pixelSpacing[1]}`);
    }
    if (ageMonths !== undefined) {
      formData.append('age_months', ageMonths.toString());
    }
    if (gender) {
      formData.append('gender', gender);
    }
    
    const response = await axios.post<UploadResponse>(`${API_URL}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  convertDicom: async (file: File): Promise<ConvertResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post<ConvertResponse>(`${API_URL}/convert`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  recalculate: async (data: RecalculateRequest): Promise<RecalculateResponse> => {
    const response = await axios.post<RecalculateResponse>(`${API_URL}/recalculate`, data);
    return response.data;
  },

  restartModules: async (): Promise<{status: string, message: string}> => {
    const response = await axios.post(`${API_URL}/restart`);
    return response.data;
  }
};

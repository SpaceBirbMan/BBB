import { configureStore } from '@reduxjs/toolkit';
import analysisReducer from './analysisSlice';
import medicalReducer from './medicalSlice';
import tabsReducer from './tabsSlice';

export const store = configureStore({
  reducer: {
    analysis: analysisReducer,
    medical: medicalReducer,
    tabs: tabsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

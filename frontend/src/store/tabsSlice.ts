import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export interface TabData {
  id: string;
  title: string;
  analysis: any;
  medical: any;
}

interface TabsState {
  tabs: TabData[];
  activeTabId: string | null;
}

const initialState: TabsState = {
  tabs: [],
  activeTabId: null,
};

export const tabsSlice = createSlice({
  name: 'tabs',
  initialState,
  reducers: {
    addTab: (state, action: PayloadAction<TabData>) => {
      state.tabs.push(action.payload);
      state.activeTabId = action.payload.id;
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTabId = action.payload;
    },
    updateActiveTabContent: (state, action: PayloadAction<{ analysis: any; medical: any }>) => {
      const activeTab = state.tabs.find(t => t.id === state.activeTabId);
      if (activeTab) {
        activeTab.analysis = action.payload.analysis;
        activeTab.medical = action.payload.medical;
      }
    },
    removeTab: (state, action: PayloadAction<string>) => {
      state.tabs = state.tabs.filter(t => t.id !== action.payload);
      if (state.activeTabId === action.payload) {
        state.activeTabId = state.tabs.length > 0 ? state.tabs[state.tabs.length - 1].id : null;
      }
    }
  },
});

export const { addTab, setActiveTab, updateActiveTabContent, removeTab } = tabsSlice.actions;
export default tabsSlice.reducer;

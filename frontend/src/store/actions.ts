import { createAction } from '@reduxjs/toolkit';

export const loadTab = createAction<{ analysis: any; medical: any }>('LOAD_TAB');

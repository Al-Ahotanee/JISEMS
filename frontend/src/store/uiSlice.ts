import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  sidebarOpen: boolean;
  theme: string;
  isMobile: boolean;
  isOnline: boolean;
}

const initialState: UiState = {
  sidebarOpen: true,
  theme: 'dark',
  isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    setIsMobile: (state, action: PayloadAction<boolean>) => {
      state.isMobile = action.payload;
      if (action.payload) {
        state.sidebarOpen = false;
      }
    },
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
  },
});

export const { toggleSidebar, setSidebarOpen, setIsMobile, setOnlineStatus } = uiSlice.actions;
export default uiSlice.reducer;

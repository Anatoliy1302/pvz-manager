// src/context/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

type ThemeMode = 'light' | 'dark';

interface ThemeColors {
  background: string;
  surface: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  text: string;
  textSecondary: string;
  border: string;
  card: string;
  error: string;
  success: string;
  warning: string;
}

const lightColors: ThemeColors = {
  background: '#F8F9FA',
  surface: '#FFFFFF',
  primary: '#6C5CE7',
  primaryDark: '#5A4BC4',
  primaryLight: '#E8EAF6',
  text: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E8E8E8',
  card: '#FFFFFF',
  error: '#E24A4A',
  success: '#28A745',
  warning: '#FF9800',
};

const darkColors: ThemeColors = {
  background: '#121212',
  surface: '#1E1E1E',
  primary: '#8B7DF0',
  primaryDark: '#7A6BE0',
  primaryLight: '#2D2D3A',
  text: '#FFFFFF',
  textSecondary: '#AAAAAA',
  border: '#2C2C2C',
  card: '#1E1E1E',
  error: '#CF6679',
  success: '#4CAF50',
  warning: '#FFB74D',
};

interface ThemeContextData {
  theme: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeMode] = useState<ThemeMode>('light');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const saved = await SecureStore.getItemAsync('app_theme');
      if (saved === 'light' || saved === 'dark') {
        setThemeMode(saved);
      }
    } catch (error) {
      console.error('Ошибка загрузки темы:', error);
    }
  };

  const setTheme = async (newTheme: ThemeMode) => {
    setThemeMode(newTheme);
    await SecureStore.setItemAsync('app_theme', newTheme);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  const colors = theme === 'light' ? lightColors : darkColors;

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
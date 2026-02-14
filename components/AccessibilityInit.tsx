"use client";

import { useEffect } from 'react';
import { SettingsManager } from '@/lib/settings';

export default function AccessibilityInit() {
  useEffect(() => {
    // Читаем настройки из памяти и сразу применяем
    const settings = SettingsManager.get();
    if (settings.globalTextScale) {
      document.documentElement.style.setProperty('--app-text-scale', settings.globalTextScale.toString());
    }
  }, []);

  return null;
}
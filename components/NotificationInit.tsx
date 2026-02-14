"use client";

import { useEffect } from 'react';
import { NotificationManager } from '@/lib/notifications';
import { App as CapApp } from '@capacitor/app';

export default function NotificationInit() {
  useEffect(() => {
    const init = async () => {
      // 1. Спрашиваем разрешение при первом запуске
      const hasPermission = await NotificationManager.requestPermission();
      
      if (hasPermission) {
        // 2. Если разрешили — сразу планируем напоминания по всем задачам
        console.log('🔔 Права есть, обновляем таймеры...');
        await NotificationManager.scheduleAllReminders();
      }
    };

    init();

    // 3. Дополнительно: обновляем таймеры, когда приложение возвращается из фона
    const listener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        NotificationManager.checkUpcomingTasks(); // Проверка "на лету"
        NotificationManager.scheduleAllReminders(); // Перепланирование будущих
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  return null; // Этот компонент ничего не рисует, он только работает
}
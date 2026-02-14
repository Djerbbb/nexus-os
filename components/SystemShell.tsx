"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; // <--- НУЖНО ДЛЯ РЕДИРЕКТА
import { App as CapApp } from '@capacitor/app'; // <--- НУЖНО ДЛЯ СЛУШАТЕЛЯ
import { supabase } from '@/lib/supabase'; // <--- НУЖНО ДЛЯ АВТОРИЗАЦИИ
import { SettingsManager } from '@/lib/settings';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';
import { Fingerprint, Lock, Loader2 } from 'lucide-react';

export default function SystemShell({ children }: { children: React.ReactNode }) {
  const router = useRouter(); // <--- Инициализируем роутер
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- 1. БИОМЕТРИЯ ---
  const performBiometricCheck = async () => {
     try {
        await NativeBiometric.verifyIdentity({
            reason: "Вход в Nexus OS",
            title: "Доступ ограничен",
            subtitle: "Подтвердите личность",
            description: "Приложите палец для входа"
        }).then(() => setIsLocked(false)); // Разблокируем только при успехе
     } catch (e) {
        console.error("Biometric error:", e);
        // Не разблокируем при ошибке
     }
  };

  // --- 2. ИНИЦИАЛИЗАЦИЯ (Тема + Биометрия) ---
  useEffect(() => {
    const init = async () => {
        const settings = SettingsManager.get();
        SettingsManager.applyTheme(settings);

        // Проверяем, нужна ли биометрия (Только на телефоне)
        if (settings.useBiometrics && Capacitor.isNativePlatform()) {
            setIsLocked(true); // Блокируем экран
            await performBiometricCheck(); // Просим палец
        } else {
            setIsLocked(false);
        }
        setIsLoading(false);
    };
    init();
  }, []);

  // --- 3. DEEP LINKS (Сброс пароля) ---
  // Добавляем этот useEffect, чтобы ловить возвращение из почты
  useEffect(() => {
    const listener = CapApp.addListener('appUrlOpen', async (data) => {
      console.log('App opened with URL:', data.url);

      // Проверяем, что это наша схема (com.nexus.os)
      if (data.url.includes('com.nexus.os')) {
        
        // Разбираем URL (Supabase возвращает токены после #)
        const slug = data.url.split('.os://')[1]; 
        
        if (slug && slug.includes('#')) {
             const params = new URLSearchParams(slug.split('#')[1]);
             const accessToken = params.get('access_token');
             const refreshToken = params.get('refresh_token');
             const type = params.get('type');

             if (accessToken && refreshToken) {
                 // Восстанавливаем сессию
                 const { error } = await supabase.auth.setSession({
                     access_token: accessToken,
                     refresh_token: refreshToken,
                 });

                 if (!error) {
                     // Если это восстановление пароля — ведем в настройки
                     if (type === 'recovery') {
                         router.push('/settings'); 
                         // Даже если экран заблокирован биометрией,
                         // роутер переключит страницу на фоне.
                         // Когда пользователь приложит палец, он увидит настройки.
                         alert('Сессия восстановлена. Придумайте новый пароль.');
                     } else {
                         router.push('/');
                     }
                 }
             }
        }
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);


  // --- ЭКРАНЫ ---

  // Экран загрузки
  if (isLoading) return <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center"><Loader2 className="animate-spin text-neutral-500"/></div>;

  // Экран БЛОКИРОВКИ
  if (isLocked) {
      return (
        <div className="h-screen w-screen bg-neutral-950 flex flex-col items-center justify-center gap-6 z-[9999] relative animate-in fade-in">
           <div className="p-6 bg-neutral-900 rounded-full border border-white/5 shadow-2xl shadow-rose-500/10">
              <Lock size={48} className="text-rose-500" />
           </div>
           
           <div className="text-center">
             <h1 className="text-2xl font-light text-white mb-1">Nexus Locked</h1>
             <p className="text-neutral-500 text-sm">Требуется аутентификация</p>
           </div>

           <button 
             onClick={performBiometricCheck}
             className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition shadow-lg shadow-indigo-500/20 mt-4 active:scale-95"
           >
             <Fingerprint size={20} /> Разблокировать
           </button>
        </div>
      );
  }

  // Если всё ок — показываем приложение
  return <>{children}</>;
}
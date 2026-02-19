"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/lib/supabase';
import { SettingsManager } from '@/lib/settings';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';
import { Fingerprint, Lock, Loader2, XCircle, Wrench } from 'lucide-react';

export default function SystemShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Новые состояния для контроля доступа
  const [isBanned, setIsBanned] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);

  const performBiometricCheck = async () => {
     try {
        await NativeBiometric.verifyIdentity({
            reason: "Вход в Nexus OS",
            title: "Доступ ограничен",
            subtitle: "Подтвердите личность",
            description: "Приложите палец для входа"
        }).then(() => setIsLocked(false));
     } catch (e) {
        console.error("Biometric error:", e);
     }
  };

  useEffect(() => {
    const init = async () => {
        const settings = SettingsManager.get();
        SettingsManager.applyTheme(settings);

        // 1. ПРОВЕРКА ДОСТУПА (Блокировка и Обслуживание)
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            // Надежное фоновое обновление с отловом ошибок
            const { error: lsError } = await supabase
                .from('profiles')
                .update({ last_seen: new Date().toISOString() })
                .eq('id', session.user.id);
            
            if (lsError) {
                console.error("Ошибка обновления онлайна:", lsError.message);
            }

            // Запрашиваем профиль юзера
            const { data: profile } = await supabase
                .from('profiles')
                .select('is_banned, role')
                .eq('id', session.user.id)
                .single();

            // Запрашиваем глобальные настройки
            const { data: sysSettings } = await supabase
                .from('system_settings')
                .select('maintenance_mode')
                .single();

            if (profile?.is_banned) {
                setIsBanned(true);
            }

            // Если тех. работы и юзер НЕ creator/admin - блокируем
            if (sysSettings?.maintenance_mode && profile?.role === 'user') {
                setIsMaintenance(true);
            }
        }

        // 2. БИОМЕТРИЯ
        if (settings.useBiometrics && Capacitor.isNativePlatform()) {
            setIsLocked(true);
            await performBiometricCheck();
        } else {
            setIsLocked(false);
        }
        
        setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    const listener = CapApp.addListener('appUrlOpen', async (data) => {
      if (data.url.includes('com.nexus.os')) {
        const slug = data.url.split('.os://')[1]; 
        if (slug && slug.includes('#')) {
             const params = new URLSearchParams(slug.split('#')[1]);
             const accessToken = params.get('access_token');
             const refreshToken = params.get('refresh_token');
             const type = params.get('type');

             if (accessToken && refreshToken) {
                 const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                 if (!error) {
                     if (type === 'recovery') {
                         router.push('/settings'); 
                         alert('Сессия восстановлена. Придумайте новый пароль.');
                     } else {
                         router.push('/');
                     }
                 }
             }
        }
      }
    });
    return () => { listener.then(l => l.remove()); };
  }, [router]);

  if (isLoading) return <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center"><Loader2 className="animate-spin text-neutral-500"/></div>;

  // --- ЭКРАН БЛОКИРОВКИ ПОЛЬЗОВАТЕЛЯ (БАН) ---
  if (isBanned) {
      return (
        <div className="h-screen w-screen bg-neutral-950 flex flex-col items-center justify-center gap-4 z-[9999] relative">
           <XCircle size={64} className="text-rose-500 mb-4" />
           <h1 className="text-2xl font-bold text-white">Доступ ограничен</h1>
           <p className="text-neutral-500 text-sm max-w-sm text-center">Ваша учетная запись была заблокирована администратором системы. Обратитесь в поддержку.</p>
           <button onClick={() => { supabase.auth.signOut(); router.push('/auth'); }} className="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition">Выйти из аккаунта</button>
        </div>
      );
  }

  // --- ЭКРАН ТЕХНИЧЕСКИХ РАБОТ ---
  if (isMaintenance) {
      return (
        <div className="h-screen w-screen bg-neutral-950 flex flex-col items-center justify-center gap-4 z-[9999] relative">
           <Wrench size={64} className="text-amber-500 mb-4" />
           <h1 className="text-2xl font-bold text-white">Технические работы</h1>
           <p className="text-neutral-500 text-sm max-w-sm text-center">В Nexus OS проводится плановое обслуживание. Скоро всё заработает, подождите немного.</p>
           <button onClick={() => { supabase.auth.signOut(); router.push('/auth'); }} className="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition">Выйти из аккаунта</button>
        </div>
      );
  }

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
           <button onClick={performBiometricCheck} className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition shadow-lg shadow-indigo-500/20 mt-4 active:scale-95">
             <Fingerprint size={20} /> Разблокировать
           </button>
        </div>
      );
  }

  return <>{children}</>;
}
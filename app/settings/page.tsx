"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Fingerprint, Eye, EyeOff, 
  Bell, Shield, CheckSquare, Brain
} from 'lucide-react';
import { SettingsManager, AppSettings } from '../../lib/settings';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>(SettingsManager.get());
  const [biometryAvailable, setBiometryAvailable] = useState(false);

  useEffect(() => {
    const checkBiometry = async () => {
      if (Capacitor.isNativePlatform()) {
        const result = await NativeBiometric.isAvailable().catch(() => ({ isAvailable: false }));
        setBiometryAvailable(result.isAvailable);
      }
    };
    checkBiometry();
    SettingsManager.applyTheme(settings);
  }, []);

  const handleUpdate = (key: keyof AppSettings, value: any) => {
    const updated = SettingsManager.save({ [key]: value });
    setSettings(updated);
  };

  return (
    <div className="flex flex-col h-full bg-main text-main animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex items-center gap-3 p-6 border-b border-neutral-500/10 shrink-0">
        <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-white/5 rounded-full transition text-muted hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-light">Настройки</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

        {/* === ИНТЕРФЕЙС (НОВОЕ) === */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Eye size={14}/> Интерфейс
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            
            {/* Глобальный масштаб */}
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                 <div>
                    <div className="text-sm font-medium">Масштаб приложения</div>
                    <div className="text-[10px] text-muted">Размер кнопок, текста и меню</div>
                 </div>
                 <div className="text-xs font-mono bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded">
                    {Math.round((settings.globalTextScale || 1) * 100)}%
                 </div>
              </div>
              
              <div className="flex items-center gap-3">
                 <span className="text-xs text-muted font-bold">A</span>
                 <input 
                   type="range" 
                   min="0.85" 
                   max="1.25" 
                   step="0.05"
                   value={settings.globalTextScale || 1}
                   onChange={(e) => {
                      const newVal = parseFloat(e.target.value);
                      // 1. Сохраняем (функция handleUpdate сама сохранит в localStorage)
                      handleUpdate('globalTextScale', newVal);
                      // 2. Применяем мгновенно
                      document.documentElement.style.setProperty('--app-text-scale', newVal.toString());
                   }}
                   className="flex-1 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                 />
                 <span className="text-lg text-muted font-bold">A</span>
              </div>
              <div className="flex justify-between text-[10px] text-neutral-600 mt-2 px-1 font-mono uppercase">
                 <span>Мелко</span>
                 <span>Стандарт</span>
                 <span>Крупно</span>
              </div>
            </div>

          </div>
        </section>
        
        {/* 1. БЕЗОПАСНОСТЬ */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Shield size={14}/> Безопасность
          </h2>
          
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            {/* Биометрия */}
            {biometryAvailable && (
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-primary-20 text-primary rounded-lg"><Fingerprint size={18}/></div>
                   <div>
                     <div className="text-sm font-medium">Вход по биометрии</div>
                     <div className="text-[10px] text-muted">FaceID / Fingerprint</div>
                   </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.useBiometrics} onChange={e => handleUpdate('useBiometrics', e.target.checked)} className="sr-only peer"/>
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            )}

            {/* Скрытие баланса */}
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">{settings.hideBalances ? <EyeOff size={18}/> : <Eye size={18}/>}</div>
                   <div>
                     <div className="text-sm font-medium">Скрывать балансы</div>
                     <div className="text-[10px] text-muted">Заменять цифры на ***</div>
                   </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.hideBalances} onChange={e => handleUpdate('hideBalances', e.target.checked)} className="sr-only peer"/>
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
            </div>
          </div>
        </section>

        {/* 2. ЗАДАЧИ */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <CheckSquare size={14}/> Задачи
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            
            {/* Авто-архивация */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Авто-архивация</div>
                <div className="text-[10px] text-muted">Скрывать завершенные через 24ч</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.autoArchiveTasks} onChange={e => handleUpdate('autoArchiveTasks', e.target.checked)} className="sr-only peer"/>
                <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Мой день */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Список «Мой день»</div>
                <div className="text-[10px] text-muted">Поведение в полночь</div>
              </div>
              <select value={settings.myDayCleanup} onChange={e => handleUpdate('myDayCleanup', e.target.value)} className="bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-xs text-main focus:outline-none">
                <option value="keep">Оставлять</option>
                <option value="clear">Очищать</option>
              </select>
            </div>

            {/* Напоминания */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Напоминание</div>
                <div className="text-[10px] text-muted">Время до дедлайна</div>
              </div>
              <select value={settings.reminderInterval} onChange={e => handleUpdate('reminderInterval', parseInt(e.target.value))} className="bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-xs text-main focus:outline-none">
                <option value={15}>15 мин</option>
                <option value={60}>1 час</option>
                <option value={180}>3 часа</option>
              </select>
            </div>

            {/* Помодоро */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Таймер фокуса</div>
                <div className="text-[10px] text-muted">Длительность сессии</div>
              </div>
              <select value={settings.pomodoroDuration} onChange={e => handleUpdate('pomodoroDuration', parseInt(e.target.value))} className="bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-xs text-main focus:outline-none">
                <option value={25}>25 мин</option>
                <option value={45}>45 мин</option>
                <option value={60}>60 мин</option>
              </select>
            </div>
          </div>
        </section>
        
        {/* 3. УВЕДОМЛЕНИЯ */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Bell size={14}/> Уведомления
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
              
              <div className="flex items-center justify-between p-4">
                  <div>
                     <div className="text-sm font-medium">Утренняя сводка</div>
                     <div className="text-[10px] text-muted">Ежедневный план задач</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={settings.enableMorningBriefing} 
                      onChange={e => handleUpdate('enableMorningBriefing', e.target.checked)} 
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
              </div>

              {settings.enableMorningBriefing && (
                  <div className="flex items-center justify-between p-4 animate-in slide-in-from-top-2">
                      <div className="text-sm font-medium text-muted">Время отправки</div>
                      <select 
                        value={settings.morningBriefingHour} 
                        onChange={e => handleUpdate('morningBriefingHour', parseInt(e.target.value))}
                        className="bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-xs text-main focus:outline-none focus:border-primary transition"
                      >
                        {Array.from({length: 24}, (_, i) => (
                          <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                        ))}
                      </select>
                  </div>
              )}
          </div>
        </section>
        {/* === ФИНАНСЫ (НОВЫЙ РАЗДЕЛ) === */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="text-emerald-500">$</span> Финансы
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            
            {/* 1. Курс Доллара */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Курс USD</div>
                <div className="text-[10px] text-muted">Для конвертации валют</div>
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-sm text-muted">1$ =</span>
                 <input 
                   type="number" 
                   value={settings.usdRate} 
                   onChange={e => handleUpdate('usdRate', parseFloat(e.target.value) || 0)}
                   className="w-16 bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-emerald-500 transition"
                 />
                 <span className="text-sm text-muted">₽</span>
              </div>
            </div>

            {/* 2. Месячный лимит */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Лимит трат</div>
                <div className="text-[10px] text-muted">Предупреждать при превышении</div>
              </div>
              <div className="flex items-center gap-2">
                 <input 
                   type="number" 
                   value={settings.monthlyLimit} 
                   onChange={e => handleUpdate('monthlyLimit', parseFloat(e.target.value) || 0)}
                   className="w-24 bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-rose-500 transition"
                 />
                 <span className="text-sm text-muted">₽</span>
              </div>
            </div>

          </div>
        </section>

        {/* === МОЗГИ (НОВЫЙ РАЗДЕЛ) === */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Brain size={14}/> Мозги
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            
            {/* 1. Автосохранение */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Автосохранение</div>
                <div className="text-[10px] text-muted">Сохранять текст при вводе</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.noteAutosave} onChange={e => handleUpdate('noteAutosave', e.target.checked)} className="sr-only peer"/>
                <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* 2. Размер шрифта */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Размер текста</div>
                <div className="text-[10px] text-muted">В редакторе и просмотре</div>
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-xs text-muted">A</span>
                 <input 
                   type="range" 
                   min="12" 
                   max="24" 
                   step="1"
                   value={settings.noteFontSize} 
                   onChange={e => handleUpdate('noteFontSize', parseInt(e.target.value))}
                   className="w-24 accent-indigo-500"
                 />
                 <span className="text-sm font-mono w-6 text-right">{settings.noteFontSize}</span>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  );
}
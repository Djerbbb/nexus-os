"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Hexagon, CheckSquare, Brain, Wallet, 
  Dumbbell, Activity, Fingerprint, ChevronRight, ChevronLeft, ArrowRight
} from 'lucide-react';

const SLIDES = [
  {
    id: 'welcome',
    title: 'Добро пожаловать в Nexus OS',
    desc: 'Ваша персональная операционная система. Nexus объединяет дела, знания, финансы и здоровье в единую безопасную экосистему. Работает автономно и мгновенно синхронизируется.',
    Icon: Hexagon,
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10'
  },
  {
    id: 'tasks',
    title: 'Управление задачами',
    desc: 'Создавайте проекты и разбивайте их на подзадачи. Используйте таймер Pomodoro для фокуса. Система автоматически очищает "Мой день", чтобы вы начинали с чистого листа.',
    Icon: CheckSquare,
    color: 'text-indigo-400',
    bg: 'bg-indigo-400/10'
  },
  {
    id: 'brain',
    title: 'Ваш второй мозг',
    desc: 'Храните идеи, конспекты и документы в модуле Brain. Поддержка папок, связей между заметками и Markdown. Всё сохраняется автоматически в процессе написания.',
    Icon: Brain,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10'
  },
  {
    id: 'finance',
    title: 'Контроль ресурсов',
    desc: 'Записывайте доходы и расходы. Устанавливайте ежемесячные лимиты для контроля бюджета. В людном месте баланс можно скрыть одним нажатием в настройках.',
    Icon: Wallet,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10'
  },
  {
    id: 'kinetic',
    title: 'Физическая активность',
    desc: 'Библиотека упражнений и журнал тренировок. Фиксируйте свои спортивные достижения и отслеживайте статистику активности за текущий месяц.',
    Icon: Dumbbell,
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10'
  },
  {
    id: 'chronos',
    title: 'Лента времени',
    desc: 'Nexus OS ничего не забывает. Модуль Chronos бережно логирует каждое создание, изменение или удаление данных. Вы всегда сможете посмотреть свою историю действий.',
    Icon: Activity,
    color: 'text-rose-400',
    bg: 'bg-rose-400/10'
  },
  {
    id: 'security',
    title: 'Данные под защитой',
    desc: 'Ваша информация хранится локально на устройстве (Offline-first). Для максимальной приватности включите биометрический вход (Touch ID / Face ID) в настройках системы.',
    Icon: Fingerprint,
    color: 'text-neutral-300',
    bg: 'bg-neutral-500/10'
  }
];

export default function OnboardingModal({ onComplete }: { onComplete: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const CurrentIcon = SLIDES[currentIndex].Icon;

  const nextSlide = () => {
    if (currentIndex < SLIDES.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const prevSlide = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden relative">
        
        {/* Анимация слайдов */}
        <div className="relative h-80">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className={`p-6 rounded-3xl mb-6 ${SLIDES[currentIndex].bg}`}>
                <CurrentIcon className={`w-16 h-16 ${SLIDES[currentIndex].color}`} strokeWidth={1.5} />
              </div>
              <h2 className="text-xl font-bold text-white mb-3">
                {SLIDES[currentIndex].title}
              </h2>
              <p className="text-sm text-neutral-400 leading-relaxed">
                {SLIDES[currentIndex].desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Навигация */}
        <div className="p-6 bg-neutral-950/50 flex flex-col gap-4">
          
          {/* Индикаторы (Точки) */}
          <div className="flex justify-center gap-2 mb-2">
            {SLIDES.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-6 bg-indigo-500' : 'w-2 bg-neutral-700'}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button 
              onClick={prevSlide}
              disabled={currentIndex === 0}
              className="p-3 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 transition"
            >
              <ChevronLeft size={20} />
            </button>
            
            <button 
              onClick={nextSlide}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-500/20"
            >
              {currentIndex === SLIDES.length - 1 ? (
                <>Запустить систему <ArrowRight size={18} /></>
              ) : (
                <>Далее <ChevronRight size={18} /></>
              )}
            </button>
          </div>
          
          {currentIndex < SLIDES.length - 1 && (
             <button 
               onClick={onComplete}
               className="text-xs text-neutral-500 hover:text-white transition mt-2 uppercase tracking-wider"
             >
               Пропустить обучение
             </button>
          )}
        </div>

      </div>
    </div>
  );
}
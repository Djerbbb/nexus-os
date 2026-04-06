// lib/settings.ts

export type AppSettings = {
  // === БЕЗОПАСНОСТЬ & УВЕДОМЛЕНИЯ ===
  hasSeenOnboarding: boolean;
  useBiometrics: boolean;
  hideBalances: boolean;      
  enableMorningBriefing: boolean; 
  morningBriefingHour: number;
  
  // === ЗАДАЧИ ===
  autoArchiveTasks: boolean;        
  myDayCleanup: 'clear' | 'keep';   
  reminderInterval: number;         
  pomodoroDuration: number;         

  // === ФИНАНСЫ (НОВОЕ) ===
  usdRate: number;        // Курс доллара к рублю
  monthlyLimit: number;   // Лимит трат на месяц (в рублях)

  // === МОЗГИ (НОВОЕ) ===
  noteAutosave: boolean;  // Автосохранение заметок
  noteFontSize: number;   // Размер шрифта (px)

  globalTextScale: number;

  // === ХРОНОС (НОВОЕ) ===
  chronosRetentionDays: number;   // Сколько дней хранить (7, 30, 60)
  chronosLogCreate: boolean;      // Логировать создание?
  chronosLogUpdate: boolean;      // Логировать изменения?
  chronosLogDelete: boolean;      // Логировать удаление?
};

const DEFAULT_SETTINGS: AppSettings = {
  hasSeenOnboarding: false,
  useBiometrics: false,
  hideBalances: false,
  enableMorningBriefing: true, 
  morningBriefingHour: 9,
  autoArchiveTasks: true,
  myDayCleanup: 'keep',
  reminderInterval: 60,
  pomodoroDuration: 25,
  usdRate: 90,           // Ставим 90 как базу
  monthlyLimit: 50000,   // Базовый лимит 50к
  noteAutosave: true,     // Включено по умолчанию
  noteFontSize: 14,       // Стандартный размер
  globalTextScale: 1,
  chronosRetentionDays: 30,       // Храним месяц
  chronosLogCreate: true,
  chronosLogUpdate: true,
  chronosLogDelete: true,
};

export const SettingsManager = {
  get: (): AppSettings => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    const raw = localStorage.getItem('nexus_settings');
    // Делаем глубокое слияние, чтобы при обновлении структуры не терялись данные
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...parsed };
  },

  save: (newSettings: Partial<AppSettings>) => {
    const current = SettingsManager.get();
    const updated = { ...current, ...newSettings };
    localStorage.setItem('nexus_settings', JSON.stringify(updated));
    SettingsManager.applyTheme(updated);
    return updated;
  },

  applyTheme: (settings: AppSettings) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark'); 
    root.style.setProperty('--primary', '99 102 241'); 
    root.style.setProperty('--note-font-size', `${settings.noteFontSize}px`);
  }
};
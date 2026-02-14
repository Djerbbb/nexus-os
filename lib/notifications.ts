import { LocalDB } from './db';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { SettingsManager } from '@/lib/settings';
const ID_MORNING_BRIEFING = 999999;
const ID_FOCUS_COMPLETE = 888888;

// Тип для задачи
type TodoTask = {
  id: number;
  title: string;
  due_date: string | null;
  is_complete: boolean;
};

export const NotificationManager = {
  // 1. Запрос разрешения (Универсальный)
  requestPermission: async () => {
    try {
      // А. ЕСЛИ ЭТО МОБИЛЬНОЕ ПРИЛОЖЕНИЕ (APK)
      if (Capacitor.isNativePlatform()) {
        const result = await LocalNotifications.requestPermissions();
        if (result.display === 'granted') {
           // Пробный пуш
           await NotificationManager.send('Nexus', 'Системные уведомления активны! 🚀');
           // Сразу планируем будущие задачи при получении прав
           await NotificationManager.scheduleAllReminders();
           return true;
        }
        return false;
      }

      // Б. ЕСЛИ ЭТО ОБЫЧНЫЙ БРАУЗЕР (PWA)
      if (typeof window !== 'undefined' && !('Notification' in window)) {
        alert('Ваше устройство не поддерживает веб-уведомления.');
        return false;
      }

      if (Notification.permission === 'denied') {
        alert('🚫 Уведомления выключены в настройках браузера.');
        return false;
      }

      if (Notification.permission === 'granted') return true;

      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
         new Notification('Nexus', { body: 'Уведомления успешно активированы! 🚀' });
         return true;
      }
      return false;
      
    } catch (e) {
      console.error('Ошибка прав:', e);
      alert('Ошибка доступа к уведомлениям: ' + e);
      return false;
    }
  },

  // 2. Проверка прав
  hasPermission: async () => {
    if (Capacitor.isNativePlatform()) {
        const check = await LocalNotifications.checkPermissions();
        return check.display === 'granted';
    }
    if (typeof Notification === 'undefined') return false;
    return Notification.permission === 'granted';
  },

  // 3. Отправка уведомления (Мгновенная)
  send: async (title: string, body: string) => {
    try {
      // А. Нативный режим (Android/iOS)
      if (Capacitor.isNativePlatform()) {
        await LocalNotifications.schedule({
          notifications: [
            {
              title: title,
              body: body,
              id: new Date().getTime(), // Уникальный ID
              schedule: { at: new Date(Date.now() + 100) }, // Показать мгновенно
              sound: 'default',
              //smallIcon: 'ic_stat_icon_config_sample',
              actionTypeId: "",
              extra: null
            }
          ]
        });
      } 
      // Б. Веб режим (Browser)
      else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
           navigator.serviceWorker.ready.then(reg => {
              reg.showNotification(title, {
                 body,
                 icon: '/icon-192.png'
              });
           });
        } else {
           new Notification(title, { body, icon: '/icon-192.png' });
        }
      }
    } catch (e) {
      console.error('Ошибка отправки:', e);
    }
  },

  // 4. ГЛАВНАЯ ФУНКЦИЯ: Проверка дедлайнов (Для активного приложения)
  checkUpcomingTasks: async () => {
    if (!Capacitor.isNativePlatform()) {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    }

    const todos = await LocalDB.getAll<TodoTask>('todos');
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000); 
    
    const notifiedRaw = localStorage.getItem('nexus_notified_tasks');
    const notifiedIds = notifiedRaw ? JSON.parse(notifiedRaw) : [];
    const newNotifiedIds = [...notifiedIds];

    todos.forEach(task => {
      if (!task.due_date || task.is_complete) return;
      const due = new Date(task.due_date);

      if (due > now && due <= oneHourLater) {
        if (!notifiedIds.includes(task.id)) {
          const diffMinutes = Math.round((due.getTime() - now.getTime()) / 60000);
          NotificationManager.send(
            '⏳ Дедлайн близко!',
            `Задача "${task.title}" истекает через ${diffMinutes} мин.`
          );
          newNotifiedIds.push(task.id);
        }
      }
    });

    if (newNotifiedIds.length > notifiedIds.length) {
       localStorage.setItem('nexus_notified_tasks', JSON.stringify(newNotifiedIds));
    }
  },

  // 5. НОВАЯ ФУНКЦИЯ: Планирование на будущее (Работает при закрытом приложении)
  scheduleAllReminders: async () => {
    let todayCount = 0;
    // Работает только на телефоне
    if (!Capacitor.isNativePlatform()) return;

    try {
      // А. Сначала отменяем все старые
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
      }

      // Б. Берем все задачи
      const todos = await LocalDB.getAll<TodoTask>('todos');
      const now = new Date();
      const notificationsToSchedule: any[] = [];

      todos.forEach(task => {
        if (!task.due_date || task.is_complete) return;
        
        const due = new Date(task.due_date);
        // Считаем задачи на сегодня
        if (due.toDateString() === now.toDateString()) todayCount++;
        // Читаем настройку интервала (по умолчанию 60 мин)
        const settings = SettingsManager.get();
        const intervalMinutes = settings.reminderInterval || 60;
        const reminderTime = new Date(due.getTime() - intervalMinutes * 60 * 1000);

        // 1. Планируем предупреждение (Используем intervalMinutes)
        if (reminderTime > now) {
            notificationsToSchedule.push({
                id: task.id + 100000, 
                title: '⏳ Скоро дедлайн',
                body: `Осталось ${intervalMinutes} мин: ${task.title}`,
                schedule: { at: reminderTime },
                sound: 'default',
            });
        }

        // 2. Планируем финальное уведомление (Ровно в срок)
        // Используем оригинальный ID задачи
        if (due > now) {
          notificationsToSchedule.push({
            id: task.id, 
            title: '🔥 Пора выполнить',
            body: `Задача: ${task.title}`,
            schedule: { at: due }, 
            sound: 'default',
            //smallIcon: 'ic_stat_icon_config_sample'
          });
        }
      });

      // В. Отправляем пачкой системе
      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({ notifications: notificationsToSchedule });
        console.log(`[Nexus] Запланировано фоновых уведомлений: ${notificationsToSchedule.length}`);
      }

      // Планируем утреннюю сводку
      await NotificationManager.scheduleMorningBriefing(todayCount);

    } catch (e) {
      console.error('Ошибка планирования:', e);
    }
  },
  // --- НОВЫЕ ФУНКЦИИ ---

  // 1. Утренняя сводка (каждый день в 09:00)
  // 1. Утренняя сводка (Настраиваемая)
  scheduleMorningBriefing: async (taskCount: number) => {
    if (!Capacitor.isNativePlatform()) return;

    const settings = SettingsManager.get();
    
    // --- ПРОВЕРКА ТУМБЛЕРА ---
    if (!settings.enableMorningBriefing) {
        // Если выключено — ничего не планируем (и старое не перезаписываем, 
        // так как scheduleAllReminders уже очистил старые уведомления в начале работы)
        return; 
    }

    const now = new Date();
    const nextMorning = new Date();
    // Используем ЧАС из настроек
    nextMorning.setHours(settings.morningBriefingHour, 0, 0, 0);

    // Если это время уже прошло сегодня, ставим на завтра
    if (now > nextMorning) {
        nextMorning.setDate(nextMorning.getDate() + 1);
    }

    await LocalNotifications.schedule({
        notifications: [{
            id: ID_MORNING_BRIEFING,
            title: '☀️ Доброе утро, Nexus',
            body: taskCount > 0 
                ? `На сегодня запланировано задач: ${taskCount}. Продуктивного дня!` 
                : 'На сегодня задач нет. Отличное время для планирования!',
            schedule: { at: nextMorning, repeats: true, every: 'day' },
            sound: 'default'
        }]
    });
  },

  // 2. Таймер фокуса (запланировать окончание)
  scheduleFocus: async (seconds: number) => {
    if (!Capacitor.isNativePlatform()) return;
    
    const targetTime = new Date(Date.now() + seconds * 1000);
    
    await LocalNotifications.schedule({
        notifications: [{
            id: ID_FOCUS_COMPLETE,
            title: '🧘 Фокус завершен',
            body: 'Время вышло! Отдохните или начните новый цикл.',
            schedule: { at: targetTime },
            sound: 'default'
        }]
    });
  },

  // 3. Отмена таймера фокуса (если остановили вручную)
  cancelFocus: async () => {
    if (!Capacitor.isNativePlatform()) return;
    await LocalNotifications.cancel({ notifications: [{ id: ID_FOCUS_COMPLETE }] });
  },
};
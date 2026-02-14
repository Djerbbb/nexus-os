import { supabase } from './supabase';
import { LocalDB } from './db';
import { SettingsManager } from '@/lib/settings';

type LogAction = 'create' | 'update' | 'delete' | 'complete' | 'restore' | 'income' | 'expense' | 'auth';
type LogModule = 'tasks' | 'finance' | 'brain' | 'system';

export const logEvent = async (
  module: LogModule,
  action: LogAction,
  message: string,
  metadata?: any
) => {
  try {
    const settings = SettingsManager.get();
    // Фильтр по типу действия
    if (action === 'create' && !settings.chronosLogCreate) return;
    if (action === 'update' && !settings.chronosLogUpdate) return;
    if (action === 'delete' && !settings.chronosLogDelete) return;
    // ---------------------

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return; 

    const newLog = {
      id: Date.now(), // Локальный временный ID
      user_id: user.id,
      module,
      // ВАЖНО: Переименовываем поля под новую схему БД
      event_type: action,   // action -> event_type
      description: message, // message -> description
      meta: metadata,       // metadata -> meta
      created_at: new Date().toISOString()
    };

    // 1. Сначала пишем в локальную базу (Мгновенно)
    await LocalDB.put('system_logs', newLog).catch(e => console.error("Local log error:", e));

    // 2. Отправляем в облако (Фоном)
    // Удаляем ID перед отправкой, чтобы Postgres сгенерировал свой
    const { id, ...logForRemote } = newLog;
    
    // Тут возможна ошибка, если таблица имеет строгие ограничения, 
    // но теперь имена полей совпадают.
    const { error } = await supabase.from('system_logs').insert([logForRemote]);
    
    if (error) console.error('Supabase log error:', error);

  } catch (error) {
    console.error('Failed to log event:', error);
  }
};
// lib/db.ts
import { supabase } from './supabase';

const STORES = [
  'todos', 'subtasks', 'projects', 
  'notes', 'folders', 'note_links',
  'transactions', 'categories',
  'sync_queue',
  'system_logs',
  'kinetic_workouts'
];

const DB_NAME = 'NexusLocalDB';
const DB_VERSION = 2;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      STORES.forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      });
    };
  });
};

export const LocalDB = {
  // Генератор временного ID (отрицательное число на основе времени)
  generateLocalId: () => -Date.now(),

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async put(storeName: string, data: any | any[]) {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      if (Array.isArray(data)) data.forEach(item => store.put(item));
      else store.put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async delete(storeName: string, id: number) {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // --- SYNC ENGINE ---
  
  // Добавить действие в очередь (если нет интернета)
  async addToSyncQueue(action: { table: string; type: 'INSERT' | 'UPDATE' | 'DELETE'; payload: any; tempId?: number }) {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readwrite');
      // ID для самой очереди — просто таймстемп
      tx.objectStore('sync_queue').put({ id: Date.now(), ...action });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Попытка синхронизации (вызывается при старте или появлении сети)
  async processSyncQueue() {
    if (!navigator.onLine) return; // Нет сети — не пытаемся

    const queue = await this.getAll<any>('sync_queue');
    if (queue.length === 0) return;

    console.log(`Sync: Processing ${queue.length} items...`);

    for (const item of queue) {
      try {
        const { table, type, payload, tempId, id: queueId } = item;

        if (type === 'DELETE') {
           await supabase.from(table).delete().eq('id', payload.id);
        } 
        else if (type === 'UPDATE') {
           // Удаляем локальные поля перед отправкой
           const { id, ...cleanPayload } = payload; 
           await supabase.from(table).update(cleanPayload).eq('id', id);
        } 
        else if (type === 'INSERT') {
           // Удаляем временный ID перед отправкой в Supabase
           const { id: _temp, ...cleanPayload } = payload;
           const { data, error } = await supabase.from(table).insert([cleanPayload]).select().single();
           
           if (data && !error && tempId) {
             // CRITICAL: Подмена временного ID на реальный
             // 1. Удаляем запись с временным ID
             await this.delete(table, tempId);
             // 2. Вставляем запись с реальным ID
             await this.put(table, data);
             console.log(`Sync: Swapped temp ID ${tempId} for real ID ${data.id} in ${table}`);
           }
        }

        // Если успешно — удаляем из очереди
        await this.delete('sync_queue', queueId);
        
      } catch (e) {
        console.error('Sync failed for item:', item, e);
        // Не удаляем из очереди, попробуем в следующий раз
      }
    }
  },

  // --- CLEANUP (ДЛЯ ВЫХОДА) ---
  async clear() {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      // Открываем транзакцию на все хранилища сразу
      const tx = db.transaction(STORES, 'readwrite');
      
      // Проходимся по каждому хранилищу и очищаем его
      STORES.forEach(storeName => {
        tx.objectStore(storeName).clear();
      });

      tx.oncomplete = () => {
        console.log('LocalDB cleared successfully');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
};
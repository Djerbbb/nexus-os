"use client";

import { useState, useEffect } from 'react';

export function useDevice() {
  // По умолчанию считаем, что мыши нет (безопасный режим)
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    // Проверяем: "Является ли основной указатель грубым (палец)?"
    // Это стандартный CSS Media Query для сенсоров
    const touchQuery = window.matchMedia("(pointer: coarse)");
    
    // Устанавливаем значение при загрузке
    setIsTouch(touchQuery.matches);

    // Если вдруг пользователь подключил мышку к планшету на лету - обновляем
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    touchQuery.addEventListener("change", handler);
    
    return () => touchQuery.removeEventListener("change", handler);
  }, []);

  return { isTouch };
}
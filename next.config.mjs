/** @type {import('next').NextConfig} */
const nextConfig = {  
  images: { 
    unoptimized: true 
  },
  
  // Игнорируем ошибки при сборке
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Новая секция для решения проблемы зависания
  experimental: {
    // Отключаем файловый кеш Turbopack, который часто вызывает циклы компиляции
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
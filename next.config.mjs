/** @type {import('next').NextConfig} */
const nextConfig = {  
  output: 'export',
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

};

export default nextConfig;
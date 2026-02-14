import NotificationInit from '@/components/NotificationInit';
import AccessibilityInit from '@/components/AccessibilityInit';
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { NotificationManager } from '@/lib/notifications';
import SystemShell from '@/components/SystemShell';


const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Nexus OS",
  description: "Personal Operating System",
  manifest: "/manifest.json", // Явная ссылка на манифест
  icons: {
    icon: "/icon-192.png",    // Фавиконка для браузеров
    shortcut: "/icon-192.png", // Ярлык
    apple: "/icon-192.png",    // ВАЖНО: Иконка для iPhone (Apple Touch Icon)
  },
};

// ВАЖНО: Это исправляет "челку" и растягивает приложение на весь экран
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${inter.className} bg-main text-main h-screen w-screen overflow-hidden flex`}>
        {/* Оборачиваем всё приложение в SystemShell для защиты и тем */}
        <SystemShell>
          
          <AccessibilityInit />
          <NotificationInit />
          <Sidebar />
          
          {/* Основная область */}
          <main className="flex-1 h-full overflow-hidden flex flex-col bg-neutral-950 relative">
            {/* Градиент */}
            <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-900/10 to-transparent pointer-events-none" />
            
            {/* Контент */}
            <div className="flex-1 overflow-auto custom-scrollbar relative z-10">
               {children}
            </div>
          </main>

        </SystemShell>
      </body>
    </html>
  );
}
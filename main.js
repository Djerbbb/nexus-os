const { app, BrowserWindow, protocol, Tray, Menu } = require('electron');
const serve = require('electron-serve').default || require('electron-serve');
const path = require('path');

const appName = 'Nexus OS';
const loadURL = serve({ directory: 'out' });

// --- ВСТАВИТЬ ЭТО ---
let mainWindow;
let tray = null;
let isQuitting = false;
// --------------------

// Настраиваем протокол для Deep Links (чтобы работала авторизация через почту)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('com.nexus.os', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('com.nexus.os');
}

function createTray() {
  // Используем ту же иконку, что и для приложения (убедись, что она есть в public)
  const iconPath = path.join(__dirname, 'public/icon-192.png');
  tray = new Tray(iconPath);
  
  tray.setToolTip(appName);

  // Обработка левого клика (показать/скрыть)
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
        if (mainWindow.isFocused()) {
            mainWindow.hide();
        } else {
            mainWindow.focus();
        }
    } else {
        mainWindow.show();
        mainWindow.focus();
    }
  });

  // Обработка правого клика (Контекстное меню)
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '🏠 Главная', 
      click: () => navigate('/') 
    },
    { type: 'separator' },
    { 
      label: '💰 Финансы', 
      click: () => navigate('/finance') 
    },
    { 
      label: '✅ Задачи', 
      click: () => navigate('/tasks') 
    },
    { 
      label: '🧠 База знаний', 
      click: () => navigate('/brain') 
    },
    { 
      label: '⏳ Хронос', 
      click: () => navigate('/chronos') 
    },
    { type: 'separator' },
    { 
      label: '❌ Выйти', 
      click: () => {
        isQuitting = true; // Разрешаем закрытие
        app.quit();
      } 
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// Функция навигации внутри окна
function navigate(route) {
  if (mainWindow) {
    mainWindow.show();
    // Заставляем React-приложение перейти по ссылке
    mainWindow.webContents.executeJavaScript(`window.location.assign('${route}')`);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: appName,
    icon: path.join(__dirname, 'public/icon-256.png'), // Убедись, что иконка есть в public
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Прелоад не обязателен, если мы не используем Node.js API внутри React напрямую
    }
  });

  // Убираем стандартное меню (Файл, Правка...), чтобы выглядело как приложение
  mainWindow.setMenuBarVisibility(false);
  loadURL(mainWindow);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault(); // Отменяем закрытие
      mainWindow.hide();      // Просто прячем окно
    }
    // Если isQuitting === true, то окно закроется штатно
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ЗАЩИТА ОТ ПОВТОРНОГО ЗАПУСКА (Single Instance Lock)
// Это критично для Deep Links: если кликнуть ссылку, она должна открыться 
// в УЖЕ открытом окне, а не создавать новое.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Кто-то пытался запустить вторую копию (например, клик по ссылке из письма)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      // Обработка Deep Link на Windows
      // Ссылка придет как аргумент командной строки
      const deepLink = commandLine.find((arg) => arg.startsWith('com.nexus.os://'));
      if (deepLink) {
         // Отправляем ссылку внутрь React приложения
         // Примечание: Для полной работы SystemShell может потребоваться 
         // небольшая доработка слушателя событий, но пока оставим так.
         console.log('Deep link received:', deepLink);
         mainWindow.loadURL(deepLink.replace('com.nexus.os://', 'http://localhost/')); 
         // Трюк: Deep link для Capacitor и Electron работают по-разному.
         // Для первой версии проще входить по Email+Password, 
         // так как перехват ссылок в Electron требует настройки IPC.
      }
    }
  });

app.on('ready', () => {
    createWindow();
    createTray(); // Создаем иконку в трее
  });
}

// Убираем стандартное закрытие на MacOS/Windows, если мы не хотим выходить
app.on('window-all-closed', () => {
  // Не делаем app.quit(), чтобы приложение жило в трее
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});
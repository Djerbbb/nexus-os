import React from 'react';
import { 
  Briefcase, Laptop, Gift, Coffee, Smartphone, Home, Car, ShoppingBag, Zap,
  Award, Banknote, Bitcoin, Book, Camera, Dumbbell, Gamepad2, Headphones,
  Heart, Image, Key, MapPin, Music, Palmtree, Plane, Rocket, Scissors, 
  Shirt, Star, Sun, Truck, Umbrella, Watch, Wifi, Wrench
} from 'lucide-react';

// Реестр всех доступных иконок для выбора
export const ICON_MAP: Record<string, React.ReactNode> = {
  briefcase: <Briefcase size={18} />,
  laptop: <Laptop size={18} />,
  gift: <Gift size={18} />,
  coffee: <Coffee size={18} />,
  smartphone: <Smartphone size={18} />,
  home: <Home size={18} />,
  car: <Car size={18} />,
  'shopping-bag': <ShoppingBag size={18} />,
  zap: <Zap size={18} />,
  // Extra icons
  award: <Award size={18} />,
  banknote: <Banknote size={18} />,
  bitcoin: <Bitcoin size={18} />,
  book: <Book size={18} />,
  camera: <Camera size={18} />,
  dumbbell: <Dumbbell size={18} />,
  gamepad: <Gamepad2 size={18} />,
  headphones: <Headphones size={18} />,
  heart: <Heart size={18} />,
  image: <Image size={18} />,
  key: <Key size={18} />,
  map: <MapPin size={18} />,
  music: <Music size={18} />,
  travel: <Palmtree size={18} />,
  plane: <Plane size={18} />,
  rocket: <Rocket size={18} />,
  beauty: <Scissors size={18} />,
  clothes: <Shirt size={18} />,
  star: <Star size={18} />,
  sun: <Sun size={18} />,
  truck: <Truck size={18} />,
  umbrella: <Umbrella size={18} />,
  watch: <Watch size={18} />,
  wifi: <Wifi size={18} />,
  service: <Wrench size={18} />,
};

export const getIcon = (key: string) => ICON_MAP[key] || <Zap size={18} />;
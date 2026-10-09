// Registro único de ícones/cores de categoria (dedup — antes cada tela tinha o seu
// mapa). Adicionar um ícone aqui o torna disponível em TODAS as telas de Gastos.
// Cor = token CSS (`var(--x)`) por padrão; `CATEGORY_COLORS_HEX` existe só para charts
// (recharts escreve `fill` como atributo SVG, onde `var()` não resolve).
import React from 'react';
import {
  House, Home, Building2, Store, UtensilsCrossed, Utensils, Coffee, Pizza, Beer, Salad,
  ShoppingCart, ShoppingBag, Shirt, Car, Bus, Bike, Fuel, Plane, Truck,
  HeartPulse, Stethoscope, Pill, Dumbbell, PawPrint, Baby,
  GraduationCap, BookOpen, Briefcase, Laptop, Smartphone, Wifi, Phone, Zap,
  Droplets, Flame, Gamepad2, Film, Music, Ticket, Trophy, Mountain,
  Landmark, Receipt, Coins, Gift, Wallet, PiggyBank, CreditCard, Banknote,
  TrendingUp, Tag, Sparkles, Camera, Shield, Scale, FileText, Users, Star, Heart,
  Package, Wrench, Scissors, type LucideIcon,
} from 'lucide-react';

/** Ícones disponíveis (nome → componente). Chave = nome guardado em `CategoryDef.icon`. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  House, Home, Building2, Store, UtensilsCrossed, Utensils, Coffee, Pizza, Beer, Salad,
  ShoppingCart, ShoppingBag, Shirt, Car, Bus, Bike, Fuel, Plane, Truck,
  HeartPulse, Stethoscope, Pill, Dumbbell, PawPrint, Baby,
  GraduationCap, BookOpen, Briefcase, Laptop, Smartphone, Wifi, Phone, Zap,
  Droplets, Flame, Gamepad2, Film, Music, Ticket, Trophy, Mountain,
  Landmark, Receipt, Coins, Gift, Wallet, PiggyBank, CreditCard, Banknote,
  TrendingUp, Tag, Sparkles, Camera, Shield, Scale, FileText, Users, Star, Heart,
  Package, Wrench, Scissors,
};

export const ICON_CHOICES: string[] = Object.keys(CATEGORY_ICONS);

/** Tokens de cor (variável CSS, nunca hex cru na UI). */
export const CATEGORY_COLORS: Record<string, string> = {
  blue: 'var(--blue,#3498db)',
  green: 'var(--green,#2ecc71)',
  yellow: 'var(--yellow,#e1b12c)',
  red: 'var(--red,#e74c3c)',
  brand: 'var(--brand,#7c5cff)',
  gray: 'var(--gray,#5b6270)',
};

/** Hex equivalente — só para charts (recharts `fill`). */
export const CATEGORY_COLORS_HEX: Record<string, string> = {
  blue: '#3498db',
  green: '#2ecc71',
  yellow: '#e1b12c',
  red: '#e74c3c',
  brand: '#7c5cff',
  gray: '#8b94a5',
};

export const COLOR_CHOICES: string[] = Object.keys(CATEGORY_COLORS);

export interface CategoryIconProps {
  name?: string;
  color?: string;
  size?: number;
  /** Classe do wrapper (ex.: 'ex-ico' | 'gd-ico'). Se ausente, usa 'cat-ico'. */
  className?: string;
}

/** Ícone circular de categoria com borda/cor por token. Fallback = Tag/gray. */
export function CategoryIcon({ name, color = 'gray', size = 16, className }: CategoryIconProps) {
  const Cmp = (name && CATEGORY_ICONS[name]) || Tag;
  const c = CATEGORY_COLORS[color] || CATEGORY_COLORS.gray;
  return (
    <span className={className ?? 'cat-ico'} style={{ color: c, borderColor: c }}>
      <Cmp size={size} strokeWidth={2} />
    </span>
  );
}

export const CAT_ICON_CSS = `
.cat-ico { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; border: 1px solid; background: rgba(255,255,255,0.03); flex-shrink: 0; }
`;
if (typeof document !== 'undefined' && !document.getElementById('cat-ico-styles')) {
  const style = document.createElement('style');
  style.id = 'cat-ico-styles';
  style.textContent = CAT_ICON_CSS;
  document.head.appendChild(style);
}

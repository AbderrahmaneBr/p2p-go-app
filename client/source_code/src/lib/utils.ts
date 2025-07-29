import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getRandomColorWithTextColor(): {
  color: string;
  textColor: string;
} {
  // Generate a stylish HSL color
  const hue = Math.floor(Math.random() * 360); // full spectrum
  const saturation = Math.floor(Math.random() * 30) + 70; // 70–100%
  const lightness = Math.floor(Math.random() * 30) + 30; // 30–60%

  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  // Convert to RGB to estimate brightness
  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) =>
      l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [
      Math.round(f(0) * 255),
      Math.round(f(8) * 255),
      Math.round(f(4) * 255),
    ];
  }

  const [r, g, b] = hslToRgb(hue, saturation, lightness);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const textColor = brightness > 150 ? "#000" : "#fff";

  return { color, textColor };
}

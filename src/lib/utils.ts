import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates a short 4-character alphanumeric pickup code.
 * Uses only unambiguous characters (no O/0/I/1/l) for easy reading.
 * Example output: "A7K2", "X3M9", "B4R6"
 */
export function generatePickupCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
/**
 * Formats a number consistently as Chilean Peso (CLP).
 * Style: $10.000.-
 */
export function formatCLP(amount: number): string {
  const formatted = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);

  // Chilean style adds ".-" at the end for finality in paper/menus
  return `${formatted}.-`;
}

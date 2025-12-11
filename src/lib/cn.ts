/**
 * Class Name Utility
 * 
 * Combines class names conditionally.
 * Simpler alternative to clsx for our use case.
 */

type ClassValue = string | boolean | null | undefined;

/**
 * Combine class names, filtering out falsy values
 * 
 * @example
 * cn('base', isActive && 'active', hasError && 'error')
 * // Returns: "base active" if isActive is true and hasError is false
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Light, dark, or follow the device. */
export type ThemePref = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'parakhmitra.theme'

export function readThemePref(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // Private browsing, or site data blocked. Following the device is the
    // right answer when we cannot remember a choice.
  }
  return 'system'
}

export function storeThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // Not being able to remember the choice must not break changing it.
  }
}

/**
 * Stamp the preference on <html>, where the CSS reads it.
 *
 * 'system' removes the attribute rather than resolving it here, so the
 * prefers-color-scheme media query stays in charge and the page follows the
 * device live — including when the OS flips at sunset with the tab open.
 */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

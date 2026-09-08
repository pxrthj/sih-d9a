import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon, MonitorIcon } from './Icons'
import { applyTheme, readThemePref, storeThemePref, type ThemePref } from '../lib/theme'

const OPTIONS: { value: ThemePref; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'Match device', Icon: MonitorIcon },
]

/**
 * Light / dark / follow-the-device.
 *
 * Three states rather than a two-way switch: an officer working outdoors wants
 * light regardless of what their phone decided at dusk, and someone else wants
 * the app to follow the device without thinking about it. A plain toggle cannot
 * express the second.
 */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useState<ThemePref>(() => readThemePref())

  useEffect(() => {
    applyTheme(pref)
  }, [pref])

  function choose(next: ThemePref) {
    setPref(next)
    storeThemePref(next)
  }

  return (
    <div
      className={`themetoggle ${compact ? 'themetoggle--compact' : ''}`}
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          className={`themetoggle__opt ${pref === value ? 'themetoggle__opt--on' : ''}`}
          onClick={() => choose(value)}
        >
          <Icon size={15} />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  )
}

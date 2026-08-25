---
name: Compliance Authority Grid
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#43474e'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#74777f'
  outline-variant: '#c4c6cf'
  surface-tint: '#455f88'
  primary: '#002045'
  on-primary: '#ffffff'
  primary-container: '#1a365d'
  on-primary-container: '#86a0cd'
  inverse-primary: '#adc7f7'
  secondary: '#1960a3'
  on-secondary: '#ffffff'
  secondary-container: '#7db6ff'
  on-secondary-container: '#00477f'
  tertiary: '#321b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#4f2e00'
  on-tertiary-container: '#c6955e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#adc7f7'
  on-primary-fixed: '#001b3c'
  on-primary-fixed-variant: '#2d476f'
  secondary-fixed: '#d3e4ff'
  secondary-fixed-dim: '#a2c9ff'
  on-secondary-fixed: '#001c38'
  on-secondary-fixed-variant: '#004881'
  tertiary-fixed: '#ffddba'
  tertiary-fixed-dim: '#f2bc82'
  on-tertiary-fixed: '#2b1700'
  on-tertiary-fixed-variant: '#633f0f'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
  compliance-success: '#166534'
  compliance-warning: '#B45309'
  compliance-error: '#991B1B'
  institutional-accent: '#B02A30'
  regulatory-gold: '#E0C312'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-margin: 24px
  gutter: 16px
  touch-target: 44px
---

## Brand & Style

The design system is engineered for **PackCheck AI**, an enterprise-grade platform for Legal Metrology compliance. The brand personality is **authoritative, precise, and transparent**, mirroring the reliability required by government regulatory bodies while leveraging the efficiency of artificial intelligence.

The visual direction follows a **Corporate / Modern** aesthetic with a heavy emphasis on **High-Contrast legibility**. The design prioritizes information density and clear hierarchies to ensure that legal violations are never missed. The interface utilizes generous white space to reduce cognitive load during complex audit processes, creating a digital environment that feels stable and institutional.

## Colors

The palette is anchored by **Navy (#1A365D)** and **Royal Blue (#2B6CB0)** to evoke trust and stability. We utilize a clean white base for the main work surfaces to maintain a professional, "paper-like" clarity.

- **Primary & Secondary Blues:** Used for structural elements, primary actions, and navigational headers.
- **Institutional Accent:** The extracted crimson (#B02A30) is reserved for high-level regulatory seals or specific governmental branding to signify official status.
- **Status Indicators:** Strict adherence to semantic coloring is required. Green (#166534) for full compliance, Amber (#B45309) for warnings or pending reviews, and Red (#991B1B) for immediate legal violations.
- **Neutral Backgrounds:** A very soft slate-gray (#F8FAFC) is used to differentiate between the background and card-based content areas.

## Typography

This design system utilizes **Inter** exclusively to ensure maximum readability and a systematic, utilitarian feel. Inter’s tall x-height and neutral character make it ideal for data-heavy legal documents.

- **Headlines:** Use Bold or SemiBold weights to create a strong vertical rhythm. 
- **Data Labels:** Labels in tables or property lists should use `label-lg` in a medium or semi-bold weight to distinguish between the "label" and the "value."
- **Readability:** Maintain a minimum line height of 1.5x for body text to ensure legal clauses are easily scannable.
- **Numeric Data:** For compliance values and measurements, ensure numerical figures are clear and unobstructed.

## Layout & Spacing

This design system follows a **12-column fixed grid** on desktop (1280px max-width) and a **fluid 4-column grid** on mobile.

- **Mobile-First Touch:** All interactive elements (buttons, inputs) must maintain a minimum height of **44px** to ensure accessibility for inspectors in the field.
- **Rhythm:** An 8px linear scale is used for all spacing. 
- **Reflow Rules:** On mobile devices, dashboard "widgets" (cards) stack vertically. On tablet and desktop, they use a masonry or modular grid layout to maximize information density.
- **Safe Areas:** A 24px margin is enforced on all screen edges to prevent content from touching physical device bezels.

## Elevation & Depth

To maintain a professional, trustworthy appearance, depth is used sparingly. This design system avoids aggressive shadows in favor of **Tonal Layers** and **Low-Contrast Outlines**.

- **Surface Tiers:** The main background is `#F8FAFC`. All primary content sits on white `#FFFFFF` cards.
- **Shadows:** Cards use a single, soft "Institutional Shadow": `0px 4px 6px -1px rgba(0, 0, 0, 0.05), 0px 2px 4px -1px rgba(0, 0, 0, 0.03)`.
- **Borders:** Every card and input field must have a subtle 1px border in a light slate (`#E2E8F0`) to provide definition without adding visual noise.

## Shapes

The shape language is **approachably professional**. While the core UI elements (inputs, buttons) use a standard 0.5rem (8px) radius, high-level containers and dashboard cards use a **2xl radius (1.5rem)** to create a modern, "packaged" feel.

- **Small Components:** 8px radius (Buttons, Input fields).
- **Large Containers:** 24px radius (Dashboard widgets, Analysis reports, Image preview containers).
- **Status Pills:** Fully rounded (pill-shaped) for instant recognition as a status indicator.

## Components

### Buttons
- **Primary:** Solid `#1A365D` with white text. High contrast, sharp focus states.
- **Secondary:** Ghost style with `#1A365D` borders and text.
- **Critical Action:** Solid `#991B1B` for reporting violations.

### Cards
- Standardized `rounded-xl` (1.5rem) containers.
- Must include a `title-lg` header and a subtle bottom border if content is paginated or scrolled within.

### Compliance Indicators (Chips)
- Compact, pill-shaped badges.
- **Compliant:** Light green background with dark green text.
- **Violation:** Light red background with dark red text.
- Icons should always accompany text in these indicators for accessibility.

### Input Fields
- Heavy focus on validation states. Use a 2px blue border on focus.
- Include helper text below the field for specific Legal Metrology requirements (e.g., "Enter weight in grams").

### List Items
- Clean, horizontally divided items with `16px` vertical padding.
- Use chevron icons to indicate "drill-down" capability into specific compliance subsections.

### AI Feedback Alerts
- Specialized cards with a subtle blue gradient border to signify "AI-Generated Insight," distinguishing them from manual auditor notes.
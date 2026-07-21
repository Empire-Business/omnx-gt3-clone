# DS1 — Silver Empire · Design System
**Version:** 2.0
**Classification:** Editorial Cold — Institutional Power
**Stack:** Stack-agnostic. All values in CSS custom properties, rems, and px.

---

## Table of Contents

1. [Overview & Philosophy](#1-overview--philosophy)
2. [Color System](#2-color-system)
3. [Typography System](#3-typography-system)
4. [Spacing System](#4-spacing-system)
5. [Elevation & Shadows](#5-elevation--shadows)
6. [Border Radius](#6-border-radius)
7. [Motion & Animation](#7-motion--animation)
8. [Grid & Layout](#8-grid--layout)
9. [Component Library](#9-component-library)
10. [Texture & Visual Effects](#10-texture--visual-effects)
11. [Dark Mode Design Rules](#11-dark-mode-design-rules)
12. [Usage Patterns & Anti-Patterns](#12-usage-patterns--anti-patterns)
13. [Full CSS Tokens Block](#13-full-css-tokens-block)

---

## 1. Overview & Philosophy

### System Name
**DS1 — Silver Empire**
Subtitle: *The Architecture of Authority*

### Visual DNA
Silver Empire is a cold, institutional editorial design system built for organizations that do not need to shout. Its power comes from restraint — large amounts of negative space, a disciplined typographic hierarchy, and gold used so sparingly it commands attention precisely because it is rare.

### Reference Aesthetics
| Reference | What We Borrow |
|-----------|----------------|
| Bloomberg Terminal | Data density, mono labels, stark contrast |
| FT Weekend | Cormorant Garamond editorial voice, ivory background |
| McKinsey Reports | Authority through white space, structured hierarchy |
| Vercel | Dark navy panels, platinum text, surgical minimalism |
| Linear | Motion precision, ghost borders, mist backgrounds |

### Three Core Principles

**1. Power by Void** (`Poder pelo Vazio`)
Negative space is not absence — it is presence. Every pixel of breathing room reinforces the gravity of the content. Premium layouts are 70%+ empty. Resist the urge to fill space.

**2. Typography as Structure** (`Tipografia como Estrutura`)
Typographic hierarchy dictates narrative before the user reads a single word. The font is the architecture. Cormorant Garamond carries drama; DM Sans carries meaning; IBM Plex Mono carries precision. Never use them interchangeably.

**3. Gold with Parsimony** (`Ouro com Parcimônia`)
The gold accent appears where the eye must rest. Never decorative. Always intentional. Gold is used for: eyebrow labels, section separator lines, metric value superscripts, badge dots, and panel border gradients. Nowhere else.

### Manifesto
> *"Um sistema de design construído para instituições que não precisam gritar. O poder está no espaço em branco. A autoridade está na tipografia."*
>
> — A design system built for institutions that don't need to shout. Power lives in white space. Authority lives in typography.

---

## 2. Color System

### Raw Palette

| Token | Hex | RGB | Role |
|-------|-----|-----|------|
| `--void` | `#070C14` | 7, 12, 20 | Absolute dark — deepest dark sections, shadow base |
| `--empire` | `#0D1829` | 13, 24, 41 | Dark navy — dark panels, cards, nav bg at dark, primary button bg |
| `--steel` | `#243B55` | 36, 59, 85 | Mid-blue — nav links, body subtext, secondary text |
| `--platinum` | `#BFC5CC` | 191, 197, 204 | Warm gray — dark-mode body text, subtle labels in dark |
| `--gold` | `#C9A240` | 201, 162, 64 | Amber gold — the only accent color in the system |
| `--bone` | `#F2EFE8` | 242, 239, 232 | Warm off-white — primary background |
| `--ink` | `#1A1F2E` | 26, 31, 46 | Near-black — primary text on light backgrounds |
| `--ghost` | `#E4E2DC` | 228, 226, 220 | Warm light gray — borders, dividers, subtle bg |
| `--mist` | `#F7F6F2` | 247, 246, 242 | Near-white — section bg variant, input bg, hover states |
| `--white` | `#FFFFFF` | 255, 255, 255 | Pure white — card backgrounds, input focus bg |
| `--danger` | `#8B2E2E` | 139, 46, 46 | Deep crimson — error states, destructive actions |

### Semantic Aliases

| Alias | Resolves To | Usage |
|-------|-------------|-------|
| `--bg-primary` | `--bone` | Default page background |
| `--bg-inverse` | `--empire` | Dark section/panel background |
| `--text-primary` | `--ink` | Primary readable text |
| `--text-inverse` | `--platinum` | Text on dark backgrounds |
| `--border` | `--ghost` | Default border/divider color |
| `--accent` | `--gold` | Gold accent — all accent usage |

### Light Context Pairings

| Layer | Background | Text | Border |
|-------|------------|------|--------|
| Page | `--bone` `#F2EFE8` | `--ink` `#1A1F2E` | `--ghost` `#E4E2DC` |
| Card surface | `--white` `#FFFFFF` | `--ink` `#1A1F2E` | `--ghost` `#E4E2DC` |
| Input / field | `--mist` `#F7F6F2` | `--ink` `#1A1F2E` | `--ghost` `#E4E2DC` |
| Section variant | `--mist` `#F7F6F2` | `--ink` `#1A1F2E` | `--ghost` `#E4E2DC` |
| Subtext | — | `--steel` `#243B55` | — |
| Labels | — | `--gold` `#C9A240` | — |

### Dark Context Pairings

| Layer | Background | Text | Border |
|-------|------------|------|--------|
| Deepest dark | `--void` `#070C14` | `--platinum` `#BFC5CC` | `rgba(191,197,204,0.1)` |
| Dark panel | `--empire` `#0D1829` | `--white` `#FFFFFF` | `rgba(191,197,204,0.08)` |
| Dark card | `rgba(255,255,255,0.04)` | `--white` | `rgba(191,197,204,0.1)` |
| Input (dark) | `rgba(255,255,255,0.06)` | `--platinum` | `rgba(191,197,204,0.15)` |
| Gold accent | always `--gold` `#C9A240` | — | — |

### Do / Don't

| Do | Don't |
|------|---------|
| Use `--bone` as the default page background | Use `--gold` as a background fill |
| Use `--ink` for primary text on light surfaces | Use `--mist` or `--ghost` for text |
| Use `--gold` for labels, lines, metric suffixes | Use gold for button fill (only the `.btn-gold` variant is intentional) |
| Use `rgba(7,12,20,…)` for all shadow colors | Use black `#000` for shadows — it is too cool |
| Keep platinum text on dark, ink text on light | Swap ink/platinum across contexts |

---

## 3. Typography System

### Font Stack

| Role | Family | Fallback | Google Fonts |
|------|--------|----------|--------------|
| Display | Cormorant Garamond | Georgia, serif | `family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600` |
| Body | DM Sans | system-ui, sans-serif | `family=DM+Sans:wght@300;400;500;600` |
| Mono | IBM Plex Mono | 'Courier New', monospace | `family=IBM+Plex+Mono:wght@400;500` |
| Marca (palavra do produto no lockup OMNX) | Chakra Petch | Space Grotesk, system-ui, sans-serif | `family=Chakra+Petch:wght@600;700` |

### Google Fonts Import URL

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600&family=DM+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Type Scale

| Token | px | rem | Role |
|-------|----|-----|------|
| `--text-11` | 11px | 0.6875rem | Eyebrow labels, mono caps, badge text, table headers |
| `--text-13` | 13px | 0.8125rem | Nav links, captions, secondary body, mono code |
| `--text-16` | 16px | 1rem | Base body text, inputs |
| `--text-20` | 20px | 1.25rem | Lead text, manifesto, sub-headlines |
| `--text-28` | 28px | 1.75rem | Card titles, component group headings |
| `--text-40` | 40px | 2.5rem | Section subtitles, medium headings |
| `--text-56` | 56px | 3.5rem | Section titles (h2) |
| `--text-80` | 80px | 5rem | Metric numbers in cards |
| `--text-120` | 120px | 7.5rem | Hero metric panel number |

### Weight Guide

**Cormorant Garamond** (display only — never body paragraphs)
| Weight | Style | Use |
|--------|-------|-----|
| 300 | normal | Subtle headings, light variant |
| 300 | italic | Hero title light half, editorial voice |
| 400 | normal | Specimen display |
| 400 | italic | Editorial quotes, "voz editorial" |
| 600 | normal | Section titles, card titles |
| 700 | normal | Hero title bold half, metric numbers |

**DM Sans** (body, UI, captions — never display headings)
| Weight | Use |
|--------|-----|
| 300 | Manifesto text, long-form body |
| 400 | Standard body, table cells |
| 500 | Nav links, labels, form labels |
| 600 | Buttons, nav CTA, strong UI text |

**IBM Plex Mono** (labels, tokens, metadata — never body text)
| Weight | Use |
|--------|-----|
| 400 | Mono code samples, token display |
| 500 | Section labels, table headers, badge text |

### Letter-Spacing Rules

| Context | Value | Example |
|---------|-------|---------|
| Display headings (Cormorant bold) | `-0.03em` | Hero title bold |
| Display headings (Cormorant light) | `-0.02em` | Hero title light |
| Display large (120px+) | `-0.04em` | Ghost word, metric numbers |
| Section titles | `-0.02em` | h2 section title |
| Nav logo | `+0.22em` | EMPIRE logotype |
| Mono eyebrow labels | `+0.18em` to `+0.20em` | Section labels |
| Mono badge/table headers | `+0.12em` to `+0.16em` | Badge text, th |
| Body text (DM Sans) | `0` (default) | Paragraphs |
| Nav links | `+0.06em` | Navigation |

### Line-Height Rules

| Context | Value |
|---------|-------|
| Display headings | `1.0` |
| Card titles | `1.2` |
| Section subtitles | `1.6` |
| Body paragraphs | `1.6` to `1.7` |
| Manifesto/lead text | `1.7` |
| Metrics / numbers | `1.0` |
| Mono labels | inherited |

### Usage Patterns

**Eyebrow label:**
```css
font-family: var(--font-mono);
font-size: var(--text-11);          /* 11px */
letter-spacing: 0.18em;
text-transform: uppercase;
color: var(--gold);
```
Always preceded by a 24px horizontal gold line (`::before` pseudo-element).

**Section title (h2):**
```css
font-family: var(--font-display);
font-size: var(--text-56);          /* 56px */
font-weight: 700;
letter-spacing: -0.02em;
line-height: 1.05;
color: var(--ink);
```

**Hero title — dramatic split:**
```css
/* Light italic half */
font-family: var(--font-display);
font-size: clamp(64px, 7.5vw, 110px);
font-weight: 300;
font-style: italic;
color: var(--steel);
letter-spacing: -0.02em;

/* Bold half */
font-family: var(--font-display);
font-size: clamp(64px, 7.5vw, 110px);
font-weight: 700;
color: var(--ink);
letter-spacing: -0.03em;
```

**Body paragraph:**
```css
font-family: var(--font-body);
font-size: var(--text-16);
font-weight: 300;                   /* or 400 */
color: var(--steel);
line-height: 1.6;
```

**Metric number:**
```css
font-family: var(--font-display);
font-size: var(--text-80);          /* or clamp(80px, 7vw, 112px) for hero */
font-weight: 700;
letter-spacing: -0.04em;
line-height: 1;
color: var(--ink);                  /* or --white in dark panels */
```
Metric unit/suffix: `font-size: 0.3em; font-weight: 300; color: var(--gold); font-style: italic; vertical-align: super;`

---

## 4. Spacing System

All spacing is based on a **base-4 scale**. Do not use arbitrary values outside this scale.

### Scale Table

| Token | px | rem | Typical Use |
|-------|----|-----|-------------|
| `--s4` | 4px | 0.25rem | Micro gap, dot margin |
| `--s8` | 8px | 0.5rem | Icon gap, tight stack, badge gap |
| `--s16` | 16px | 1rem | Standard gap, form group spacing |
| `--s24` | 24px | 1.5rem | Card sub-sections, label margin |
| `--s32` | 32px | 2rem | Card padding, component group spacing |
| `--s48` | 48px | 3rem | Container side padding, large vertical gap |
| `--s64` | 64px | 4rem | Section header margin-bottom, nav height |
| `--s96` | 96px | 6rem | Section vertical padding (top + bottom) |
| `--s128` | 128px | 8rem | Reserved for oversized layouts |

### Section Padding Pattern

Every major section uses:
```css
padding: var(--s96) 0;   /* 96px top and bottom */
```

### Component Internal Padding

| Component | Padding |
|-----------|---------|
| Card (standard/dark/metric) | `var(--s32)` all sides (32px) |
| Manifesto card | `var(--s32)` all sides |
| Hero panel | `var(--s48)` all sides |
| Form showcase | `var(--s48)` all sides |
| Button SM | `7px 14px` |
| Button MD | `10px 20px` |
| Button LG | `14px 28px` |
| Button XL | `16px 36px` |
| Badge | `4px 10px` |
| Input | `10px 14px` |
| Nav CTA | `9px 20px` |
| Table `th` | `12px 24px` |
| Table `td` | `16px 24px` |

---

## 5. Elevation & Shadows

Shadow color is always derived from `--void` (`#070C14` = `rgba(7,12,20,…)`). Never use pure black.

### Shadow Scale

| Token | CSS Value | Use |
|-------|-----------|-----|
| `--shadow-sm` | `0 1px 3px rgba(7,12,20,0.08), 0 1px 2px rgba(7,12,20,0.04)` | Subtle lift — default card border supplement |
| `--shadow-md` | `0 4px 16px rgba(7,12,20,0.10), 0 2px 6px rgba(7,12,20,0.06)` | Button hover, toast, small popover |
| `--shadow-lg` | `0 16px 48px rgba(7,12,20,0.14), 0 6px 16px rgba(7,12,20,0.08)` | Card hover state, modals, dropdowns |
| `--shadow-xl` | `0 32px 80px rgba(7,12,20,0.20), 0 12px 32px rgba(7,12,20,0.12)` | Hero panel, flagship card |

### Usage Rules

- **Default state:** cards have no shadow — only a `1px` border (`--ghost`). Shadow appears on hover (`--shadow-lg`).
- **Button hover:** `--shadow-md`
- **Hero dark panel:** `--shadow-xl` (permanent, not just on hover)
- **Toast notification:** `--shadow-lg`
- **Gold glow (btn-gold only):** `0 8px 24px rgba(201,162,64,0.3)` — unique exception using gold base

---

## 6. Border Radius

| Token | px | Use |
|-------|----|-----|
| `--radius-sm` | 3px | Buttons, badges, inputs, checkboxes, small chips |
| `--radius-md` | 6px | Small cards, color swatches, toast, motion dots |
| `--radius-lg` | 12px | Main cards, panels, form showcases, table wrappers |

### Usage Guide

- Never mix `--radius-lg` on small interactive elements (looks bloated)
- Table wrappers use `--radius-lg` + `overflow: hidden` to clip row borders cleanly
- Toggles use `12px` (half height of 24px element) to create pill shape
- Radio inputs use `border-radius: 50%`

---

## 7. Motion & Animation

### Philosophy
All animations use only `transform` and `opacity`. Never animate `width`, `height`, `top`, `left`, `margin`, or `color` properties — they cause layout thrashing. Motion should feel physical and intentional, never decorative.

### Easing Curves

| Token | Cubic Bezier | Feel | Use |
|-------|-------------|------|-----|
| `--ease-out` | `cubic-bezier(0.0, 0.0, 0.2, 1.0)` | Decelerates sharply | Page reveals, elements entering |
| `--ease-in-out` | `cubic-bezier(0.4, 0.0, 0.2, 1.0)` | Smooth arc | Cross-fade transitions, state changes |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1.0)` | Overshoot + settle | Button press, card hover lift, toggle |

### Duration Tokens

| Token | ms | Use |
|-------|----|-----|
| `--duration-fast` | 150ms | Hover color/bg transitions, opacity micro-changes |
| `--duration-base` | 280ms | Standard UI transitions: card hover, button states, nav |
| `--duration-slow` | 500ms | Large element transitions, panel reveal |
| `--duration-slower` | 800ms | Scroll reveal (`.reveal` class), page-level entrance |

### Animation Primitives

**fadeUp** — Element enters from below
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**scaleIn** — Element grows into place
```css
@keyframes scaleIn {
  from { transform: scale(0.6); }
  to   { transform: scale(1); }
}
```

**crossFade** — Element disappears and reappears
```css
@keyframes crossFade {
  0%   { opacity: 1; }
  50%  { opacity: 0; transform: scale(0.8); }
  100% { opacity: 1; transform: scale(1); }
}
```

**lineGrow** — Horizontal line expands left-to-right
```css
@keyframes lineGrow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
/* Always set: transform-origin: left center; */
```

**ghostWordReveal** — Ghost background word slides in
```css
@keyframes ghostWordReveal {
  from { opacity: 0; transform: translateY(-48%) translateX(-20px); }
  to   { opacity: 1; transform: translateY(-50%) translateX(0); }
}
```

**panelReveal** — Hero dark panel enters from right
```css
@keyframes panelReveal {
  from { opacity: 0; transform: translateX(32px) scale(0.97); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}
```

### Hero Entry Animation Sequence

All hero animations use `forwards` fill mode (elements start at `opacity: 0`):

| Element | Animation | Duration | Delay |
|---------|-----------|----------|-------|
| Ghost background word | `ghostWordReveal` | 1400ms | 300ms |
| Eyebrow label | `fadeUp` | 800ms | 400ms |
| Hero title | `fadeUp` | 900ms | 550ms |
| Manifesto paragraph | `fadeUp` | 900ms | 700ms |
| CTA buttons | `fadeUp` | 900ms | 850ms |
| Dark panel | `panelReveal` | 1000ms | 600ms |
| Gold bottom rule | `lineGrow` | 1200ms | 1200ms |

### Scroll Reveal Pattern

Apply the `.reveal` class to any element that should animate in on scroll. Use staggered delay modifiers for grouped elements.

```css
.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity var(--duration-slower) var(--ease-out),
              transform var(--duration-slower) var(--ease-out);
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
.reveal-delay-1 { transition-delay: 80ms; }
.reveal-delay-2 { transition-delay: 160ms; }
.reveal-delay-3 { transition-delay: 240ms; }
.reveal-delay-4 { transition-delay: 320ms; }
.reveal-delay-5 { transition-delay: 400ms; }
```

```javascript
// IntersectionObserver — add to any page using this system
const observer = new IntersectionObserver(
  entries => entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  }),
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
);
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
```

---

## 8. Grid & Layout

### Container

```css
.container {
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 var(--s48);   /* 48px side padding */
}
```

### Column Grid

- **12 columns**, `16px` gutters
- Use CSS Grid with `grid-template-columns: repeat(12, 1fr)` and `gap: var(--s16)`

### Key Layout Patterns

**Hero split (asymmetric two-column):**
```css
display: grid;
grid-template-columns: 1fr 440px;
align-items: center;
min-height: 100vh;
padding-top: 64px;   /* nav height */
```

**Three-column manifesto / principle cards:**
```css
display: grid;
grid-template-columns: repeat(3, 1fr);
gap: var(--s48);
```

**Two-column form / dark compare:**
```css
display: grid;
grid-template-columns: 1fr 1fr;
gap: var(--s48);
```

**Four-column motion / feature grid:**
```css
display: grid;
grid-template-columns: repeat(4, 1fr);
gap: var(--s24);
```

**Three-column card showcase:**
```css
display: grid;
grid-template-columns: repeat(3, 1fr);
gap: var(--s24);
```

### Section Architecture

- Fixed nav: `64px` height, `position: fixed`, `z-index: 1000`
- Page sections scroll freely behind the nav
- First content section adds `padding-top: 64px` to clear the nav
- Section vertical padding: always `var(--s96)` (96px) top and bottom

---

## 9. Component Library

### Navigation

| Property | Value |
|----------|-------|
| Height | `64px` |
| Position | `fixed`, `top: 0`, `z-index: 1000` |
| Background | `rgba(242,239,232,0.82)` — bone at 82% opacity |
| Backdrop | `backdrop-filter: blur(20px)` |
| Border-bottom | `1px solid var(--ghost)` |
| Transition | `background var(--duration-base) var(--ease-out)` |

**Logo:**
- Font: Cormorant Garamond, `20px`, weight `600`
- Letter-spacing: `0.22em`
- Text-transform: `uppercase`
- Color: `var(--ink)`
- Gold dot: `5px × 5px` circle, `background: var(--gold)`, `border-radius: 50%`

**Links:**
- Font: DM Sans, `13px`, weight `500`, letter-spacing `0.06em`
- Color: `var(--steel)` → `var(--ink)` on hover
- Transition: `color 150ms ease-out`

**Nav CTA button:**
- Font: DM Sans, `13px`, weight `600`, uppercase, letter-spacing `0.08em`
- Padding: `9px 20px`
- Background: `var(--ink)`, color: `var(--bone)`, radius: `var(--radius-sm)`
- Hover: background `var(--empire)`, `translateY(-1px)`

---

### Hero

**Ghost background word:**
- Font: Cormorant Garamond, `clamp(200px, 22vw, 380px)`, weight `700`
- Color: `var(--ghost)`, letter-spacing: `-0.04em`
- Position: `absolute`, centered vertically, starts at `-2%` left
- Z-index: `0` (behind content), `pointer-events: none`
- Entry: `ghostWordReveal` 1400ms, delay 300ms

**Hero eyebrow:**
- Font: IBM Plex Mono, `11px`, letter-spacing `0.2em`, uppercase
- Color: `var(--gold)`
- Before element: `32px × 1px` gold horizontal line
- Entry: `fadeUp` 800ms, delay 400ms

**Hero title — two-line split:**
```
Line 1 (light italic):  Cormorant 300 italic, clamp(64px, 7.5vw, 110px), steel, -0.02em
Line 2 (bold):          Cormorant 700, clamp(64px, 7.5vw, 110px), ink, -0.03em
```

**Hero manifesto:**
- DM Sans 300, `20px`, `var(--steel)`, line-height 1.7, max-width 480px

**Hero dark panel (right column):**
- Background: `var(--empire)`
- Width: `100%`, height: `58vh`, min-height: `420px`
- Radius: `var(--radius-lg)`, shadow: `var(--shadow-xl)`
- Top border: `2px` gradient `linear-gradient(90deg, var(--gold), transparent)`
- Entry: `panelReveal` 1000ms, delay 600ms
- Internal padding: `var(--s48)`

**Panel metric number:**
- Cormorant 700, `clamp(80px, 7vw, 112px)`, `var(--white)`, letter-spacing `-0.04em`
- Unit suffix: `0.38em` relative, weight 300, `var(--gold)`, italic, `vertical-align: super`

**Panel stat chip:**
- Label: IBM Plex Mono 11px, letter-spacing 0.14em, `var(--platinum)` at 70% opacity
- Value: Cormorant 28px weight 600, `var(--white)` (or `var(--gold)` for highlighted value)
- Border-bottom: `1px solid rgba(191,197,204,0.1)`
- Padding: `12px 0`

---

### Section Label Pattern

Applied to every section's category label. Always first element in section.

```css
.section-label {
  font-family: var(--font-mono);
  font-size: var(--text-11);         /* 11px */
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gold);
  display: flex;
  align-items: center;
  gap: var(--s8);
  margin-bottom: var(--s32);
}
.section-label::before {
  content: '';
  display: inline-block;
  width: 24px;
  height: 1px;
  background: var(--gold);
}
```

---

### Buttons

All buttons share these base properties:
```css
display: inline-flex; align-items: center; justify-content: center;
font-family: var(--font-body); font-weight: 600; letter-spacing: 0.04em;
border-radius: var(--radius-sm); white-space: nowrap;
transition: all var(--duration-base) var(--ease-out);
```

#### Variants

| Variant | Default BG | Default Text | Default Border | Hover |
|---------|------------|-------------|----------------|-------|
| Primary | `var(--empire)` | `var(--bone)` | `1px var(--empire)` | bg: `var(--ink)`, `translateY(-1px)`, `shadow-md` |
| Secondary | transparent | `var(--empire)` | `1.5px var(--empire)` | bg: `var(--empire)`, text: `var(--bone)`, `translateY(-1px)` |
| Ghost | transparent | `var(--steel)` | `1px transparent` | bg: `var(--mist)`, border: `var(--ghost)`, text: `var(--ink)` |
| Danger | transparent | `var(--danger)` | `1.5px var(--danger)` | bg: `var(--danger)`, text: `var(--white)`, `translateY(-1px)` |
| Gold | `var(--gold)` | `var(--empire)` | `1px var(--gold)` | bg: `#b8912e`, `translateY(-1px)`, gold glow shadow |

Gold hover shadow: `0 8px 24px rgba(201,162,64,0.3)`

#### Sizes

| Size Class | Font Size | Padding | Extra |
|------------|-----------|---------|-------|
| `.btn-sm` | `var(--text-13)` = 13px | `7px 14px` | — |
| `.btn-md` | `var(--text-16)` = 16px | `10px 20px` | — |
| `.btn-lg` | `var(--text-20)` = 20px | `14px 28px` | — |
| `.btn-xl` | `var(--text-13)` = 13px | `16px 36px` | `text-transform: uppercase; letter-spacing: 0.06em` |

Note: `.btn-xl` intentionally uses a smaller, uppercase font for maximum impact at large size.

---

### Cards

All cards share: `border-radius: var(--radius-lg); overflow: hidden;`
Hover: `transform: translateY(-4px); box-shadow: var(--shadow-lg);`
Hover transition: `transform var(--duration-base) var(--ease-spring), box-shadow var(--duration-base) var(--ease-out)`

#### Standard Card

```css
background: var(--white);
border: 1px solid var(--ghost);
padding: var(--s32);
position: relative;

/* Top empire accent bar */
::before {
  position: absolute; top: 0; left: 0; right: 0;
  height: 3px; background: var(--empire);
}
```

Internal content:
- Tag: IBM Plex Mono 10px, letter-spacing 0.14em, uppercase, `var(--gold)`, margin-bottom `s16`
- Title: Cormorant 28px weight 600, `var(--ink)`, letter-spacing -0.01em, line-height 1.2
- Body: DM Sans 16px, `var(--steel)`, line-height 1.6, opacity 0.8

#### Dark Card

```css
background: var(--empire);
border: 1px solid rgba(191,197,204,0.08);
padding: var(--s32);
position: relative;

/* Top gold gradient bar */
::before {
  position: absolute; top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--gold), transparent);
}
```

Internal content:
- Tag: `var(--gold)`
- Title: Cormorant 28px, `var(--white)`
- Body: `var(--platinum)`, opacity 0.7

#### Metric Card

```css
background: var(--white);
border: 1px solid var(--ghost);
padding: var(--s32);
display: flex; flex-direction: column; gap: var(--s16);
```

Internal content:
- Metric number: Cormorant 80px weight 700, `var(--ink)`, letter-spacing -0.04em, line-height 1
- Superscript `<sup>`: `0.3em` size, weight 300, `var(--gold)`, vertical-align super
- Label: DM Sans 13px, `var(--steel)`, opacity 0.6, letter-spacing 0.04em
- Delta badge: IBM Plex Mono 13px, `#2D7D4A` text, `rgba(45,125,74,0.1)` bg, `3px 8px` padding, radius 3px

---

### Badges

Base structure:
```css
display: inline-flex; align-items: center; gap: 5px;
font-family: var(--font-mono); font-size: 10px;
letter-spacing: 0.12em; text-transform: uppercase;
padding: 4px 10px; border-radius: 3px; font-weight: 500;
```

Badge dot: `5px × 5px`, `border-radius: 50%`

| Variant | Background | Text Color | Dot Color |
|---------|------------|------------|-----------|
| Success | `rgba(45,125,74,0.1)` | `#2D7D4A` | `#2D7D4A` |
| Warning | `rgba(201,162,64,0.12)` | `#8B6A1A` | `var(--gold)` |
| Danger | `rgba(139,46,46,0.1)` | `var(--danger)` = `#8B2E2E` | `var(--danger)` |
| Neutral | `var(--ghost)` | `var(--steel)` | `var(--platinum)` |
| Empire | `var(--empire)` | `var(--platinum)` | `var(--gold)` |

---

### Forms

Form showcase container: white bg, ghost border, radius-lg, s48 padding, 2-column grid.

#### Input Base

```css
width: 100%; padding: 10px 14px;
font-family: var(--font-body); font-size: var(--text-16);
color: var(--ink); background: var(--mist);
border: 1.5px solid var(--ghost); border-radius: var(--radius-sm);
outline: none;
transition: border-color 150ms ease-out, box-shadow 150ms ease-out, background 150ms;
-webkit-appearance: none;
```

Placeholder: `color: var(--platinum)`

#### Input States

| State | Border | Background | Box-shadow |
|-------|--------|------------|-----------|
| Default | `1.5px var(--ghost)` | `var(--mist)` | none |
| Focus | `1.5px var(--empire)` | `var(--white)` | `0 0 0 3px rgba(13,24,41,0.08)` |
| Error | `1.5px var(--danger)` | `rgba(139,46,46,0.03)` | none |

#### Form Label

```css
font-size: var(--text-13); font-weight: 500;
color: var(--ink); letter-spacing: 0.02em;
```

Sub-label: IBM Plex Mono 11px, `var(--steel)`, opacity 0.6

#### Select

Same as input base, plus:
```css
appearance: none;
background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23243B55' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
background-repeat: no-repeat;
background-position: right 14px center;
padding-right: 40px;
```

#### Checkbox

```css
width: 18px; height: 18px;
border: 1.5px solid var(--platinum);
border-radius: var(--radius-sm);
background: var(--mist);
```

Checked state: `background: var(--empire); border-color: var(--empire);`
Check mark: `content: '✓'; font-size: 11px; color: var(--white); font-weight: 700;`

#### Radio

Same as checkbox but:
- `border-radius: 50%`
- Checked inner dot: `6px × 6px` white circle (`::after` pseudo-element)

#### Toggle

```css
width: 44px; height: 24px;
background: var(--ghost);     /* off state */
border-radius: 12px;
position: relative;
transition: background var(--duration-base);
```

On state: `background: var(--empire)`

Knob:
```css
position: absolute; top: 3px; left: 3px;
width: 18px; height: 18px;
background: var(--white); border-radius: 50%;
box-shadow: 0 1px 4px rgba(0,0,0,0.2);
transition: transform var(--duration-base) var(--ease-spring);
```

On state knob: `transform: translateX(20px)`

---

### Table

Wrap the table in a container for radius clipping:
```css
.table-wrap {
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--ghost);
}
```

```css
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-16);
}
```

**Table header (`thead`):**
- Background: `var(--mist)`
- Border-bottom: `1px solid var(--ghost)`

**`th` cells:**
- Padding: `12px 24px`
- Font: IBM Plex Mono 11px, letter-spacing 0.12em, uppercase
- Color: `var(--steel)`, opacity 0.7, weight 500
- Hover: `color: var(--ink)`, opacity 1

**`td` cells:**
- Padding: `16px 24px`
- Border-bottom: `1px solid var(--ghost)` (last row: none)
- Color: `var(--ink)`, vertical-align middle

**Row hover:** `background: var(--mist)`

Special cell variants:
- `.td-name`: `font-weight: 500`
- `.td-mono`: IBM Plex Mono 13px, `var(--steel)`

---

## 10. Texture & Visual Effects

### Film Grain Overlay

A subtle noise texture applied globally via `body::before` to add tactile depth to the flat backgrounds.

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.025;    /* CRITICAL: 0.025 — any higher becomes visible as grain */
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 128px 128px;
}
```

SVG filter parameters:
- `type='fractalNoise'` — organic, non-directional grain
- `baseFrequency='0.9'` — fine grain (0.9 = small turbulence cells)
- `numOctaves='4'` — 4 layers of detail for realistic texture
- Tile: `128px × 128px` repeat

### Section Top Border (Gold Gradient)

Applied to dark sections (`.section-manifesto`, `.section-dark`) to create a glowing top edge:

```css
section::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold) 30%, var(--gold) 70%, transparent);
}
```

### Dark Panel / Card Top Border

A more dramatic gradient used on empire-background panels:

```css
::before {
  background: linear-gradient(90deg, var(--gold), transparent);
  height: 2px;   /* or 3px on standard cards using empire color */
}
```

### Gold Rule Animation

The hero section's bottom gold line that draws in on page load:

```css
.hero-gold-rule {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--gold), transparent 60%);
  transform-origin: left center;
  transform: scaleX(0);
  animation: lineGrow 1.2s var(--ease-out) 1.2s forwards;
}
```

---

## 11. Dark Mode Design Rules

Silver Empire uses **intentional dark sections** rather than a system-level dark mode toggle. Dark and light sections coexist on the same page. The contrast between light (`--bone`) and dark (`--void`/`--empire`) sections IS the design.

### Core Dark Context Tokens

| Light Token | Dark Equivalent |
|-------------|-----------------|
| `--bone` (bg) | `--void` `#070C14` (deepest) or `--empire` `#0D1829` (panel) |
| `--white` (card bg) | `rgba(255,255,255,0.04)` |
| `--ink` (text) | `--white` `#FFFFFF` |
| `--steel` (subtext) | `--platinum` `#BFC5CC` at 70-80% opacity |
| `--ghost` (border) | `rgba(191,197,204,0.1)` |
| `--gold` (accent) | **unchanged** — always `#C9A240` |

### Dark Section Backgrounds

- **Deepest dark** (`--void`): Color palette section, absolute dark, makes everything else feel elevated
- **Dark navy** (`--empire`): Manifesto section, footer, dark cards — has warmth compared to void
- **Dark glass** (`rgba(255,255,255,0.04)`): Cards and panels rendered inside a void/empire section

### Dark Mode Badge Colors (adjusted for contrast)

| Badge | Dark BG | Dark Text |
|-------|---------|-----------|
| Success | `rgba(45,125,74,0.2)` | `#5CD688` (lighter green) |
| Warning | `rgba(201,162,64,0.2)` | `#E8C26A` (lighter amber) |
| Danger | `rgba(139,46,46,0.2)` | `#E07070` (lighter red) |

### Dark Input

```css
background: rgba(255,255,255,0.06);
border: 1.5px solid rgba(191,197,204,0.15);
color: var(--platinum);
```

### Dark Card Pattern

```css
background: rgba(255,255,255,0.04);
border: 1px solid rgba(191,197,204,0.1);
border-radius: var(--radius-lg);

/* Gold top gradient */
::before {
  background: linear-gradient(90deg, var(--gold), transparent);
  height: 2px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
```

### Light vs. Dark Validation Rule

When building a new section, validate it against both contexts:
1. Render the component on `--bone` background with `--ink` text
2. Render the same component inside `--empire` background
3. Both must pass WCAG AA contrast (4.5:1 for body text)
4. Gold accent must be visible in both without changing its value

---

## 12. Usage Patterns & Anti-Patterns

### Do

| Pattern | Reason |
|---------|--------|
| Use gold exclusively on labels, separator lines, metric units, panel borders | Scarcity makes gold feel precious |
| Use negative space aggressively — most premium sections are 70%+ empty | Emptiness signals confidence |
| Pair Cormorant Garamond italic 300 with bold 700 for dramatic contrast | The tension between weights carries the hierarchy |
| Keep body copy in DM Sans 300–400 only | Heavier DM Sans weights compete with Cormorant |
| Use IBM Plex Mono exclusively for labels, tokens, metadata — never body | Mono is a signal of precision, not of readability |
| Section labels always use: mono 11px + gold + 24px gold line before text | Creates consistent visual rhythm across all sections |
| Apply `--ease-spring` only to physical interactions (button press, card lift, toggle) | Spring feels tactile, not decorative |
| Use `--void` only for the darkest dark section — never for a normal card | Too dark for most content; reserve for maximum contrast |
| Wrap tables in a container div for `border-radius` + `overflow: hidden` | CSS `border-radius` doesn't clip table edges natively |

### Don't

| Anti-Pattern | Why |
|-------------|-----|
| Use `--gold` as a background fill | Gold as a field feels garish; its power comes from sparingly |
| Use Cormorant Garamond for body paragraph text | Its high contrast hairlines make long-form text tiring |
| Mix shadow scales randomly | Inconsistent elevation breaks spatial hierarchy |
| Place text smaller than 11px | Below 11px, IBM Plex Mono becomes illegible |
| Use the mustard gold `#e8c926` from the extended palette | This system uses `#C9A240` — richer, less neon |
| Animate `width`, `height`, `top`, `left`, or `margin` | Triggers layout reflow; use `transform` + `opacity` only |
| Stack multiple gold elements in the same visual zone | Gold next to gold = neither is special |
| Apply `--shadow-xl` to small components | Oversized shadow on small elements looks wrong |
| Use Cormorant Garamond in a weight below 300 | The optical weight becomes too fragile |
| Use more than 2 font families per component | The triple-font system is already at the design limit |

---

## 12.5. Chat Components (v8.2.0)

Componentes do módulo `/chat`. Todos seguem 100% tokens semânticos — zero cores hardcoded.

| Componente | Caminho | Função |
|------------|---------|--------|
| `MessageBubble` (interno em `Chat.tsx`) | — | Bolha de mensagem com `bg-primary` (próprias) ou `bg-card` (outras), ações de hover (reagir, salvar, encaminhar, thread, editar, deletar) |
| `PresenceDot` | `src/components/chat/PresenceDot.tsx` | Bolinha verde (`bg-success`) sobre o avatar quando o colaborador está online (heartbeat <120s) |
| `ChatEmojiPicker` | `src/components/chat/ChatEmojiPicker.tsx` | Wrapper sobre emoji-mart com tema dark/light automático |
| `ChatSearchBar` | `src/components/chat/ChatSearchBar.tsx` | Barra de busca local na conversa (Cmd/Ctrl+F), navegação por ↑/↓ + Enter |
| `ThreadPanel` | `src/components/chat/ThreadPanel.tsx` | Painel lateral estilo Slack para threads (mensagem-raiz + respostas + composer) |
| `SavedMessagesSheet` | `src/components/chat/SavedMessagesSheet.tsx` | Sheet lateral com mensagens salvas (estrela `text-warning fill-current`) |
| `ForwardDialog` | `src/components/chat/ForwardDialog.tsx` | Dialog para escolher conversa-destino ao encaminhar |

### Tokens usados no chat
- **Mensagem própria:** `bg-primary text-primary-foreground` + atalhos `bg-primary-foreground/15` para overlays internos
- **Mensagem alheia:** `bg-card text-foreground` com `border-border`
- **Estrela (saved):** `text-warning fill-current`
- **Online:** `bg-success` (presença ativa) / `bg-muted` (offline)
- **Highlight de busca:** `ring-2 ring-primary` aplicado por 1.5s ao alvo de `jumpToMessage`
- **Badge de thread:** `text-primary hover:underline` com ícone `MessageSquare`

---

## 12.6. Fluxograma de Processos (v8.29.0)

Nós do diagrama BPM (`src/components/processes/BpmNodes.tsx`). **100% tokens semânticos — zero cor hardcoded.** A cor de cada nó é uma chave semântica (`FlowNodeColor`) resolvida pelo helper `accentFor`/`ACCENTS`, nunca uma cor literal.

### Paleta de cor do nó (`FlowNodeColor` → tokens)
| Chave | Fundo | Borda | Ícone/texto | Uso sugerido |
|-------|-------|-------|-------------|--------------|
| `neutral` (padrão) | `bg-card` | `border-border` | `text-muted-foreground` | Tarefa/documento/dados comuns |
| `primary` | `bg-primary/10` | `border-primary/30` | `text-primary` | Destaque neutro da marca |
| `success` | `bg-success-light` | `border-success/40` | `text-success` | Início, conclusão, "sim" |
| `warning` | `bg-warning-light` | `border-warning/40` | `text-warning` | Decisão, atenção, nota |
| `danger` | `bg-danger-light` | `border-danger/40` | `text-danger` | Fim, bloqueio, "não" |
| `info` | `bg-info-light` | `border-info/40` | `text-info` | Evento, subprocesso |

Defaults por tipo (quando `color` ausente): `start`→success, `end`→danger, `decision`→warning, `subprocess`/`event`→info, `note`→warning, demais→neutral.

### Padrões visuais
- **Handles no hover:** as bolinhas de conexão ficam `opacity-0` e só aparecem em `group-hover`/`selected` (`transition-opacity`) — canvas mais limpo. O contêiner do nó usa a classe `group`.
- **Seleção:** `ring-2` na cor do acento (`accent.ring`) + `shadow-md`.
- **Faixa de swim-lane (`laneBackground`):** retângulo `bg-muted/25` (par) / `bg-muted/10` (ímpar) `border-border/40`, `pointer-events-none`, atrás dos nós (`zIndex: -1`).
- **Formas:** start/end = pílula (`rounded-full`); decisão = losango (`rotate-45`); dados = paralelogramo (`skewX(-12deg)`); evento = círculo; documento = card com base ondulada (SVG `fill-card`).

---

## 13. Full CSS Tokens Block

Ready to copy-paste into any project's `:root {}` declaration.

```css
:root {

  /* ─────────────────────────────────────────
     COLOR SYSTEM
  ───────────────────────────────────────── */

  /* Raw Palette */
  --void:       #070C14;
  --empire:     #0D1829;
  --steel:      #243B55;
  --platinum:   #BFC5CC;
  --gold:       #C9A240;
  --bone:       #F2EFE8;
  --ink:        #1A1F2E;
  --ghost:      #E4E2DC;
  --white:      #FFFFFF;
  --mist:       #F7F6F2;
  --danger:     #8B2E2E;

  /* Semantic Aliases */
  --bg-primary:   var(--bone);
  --bg-inverse:   var(--empire);
  --text-primary: var(--ink);
  --text-inverse: var(--platinum);
  --border:       var(--ghost);
  --accent:       var(--gold);

  /* ─────────────────────────────────────────
     TYPOGRAPHY
  ───────────────────────────────────────── */

  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body:    'DM Sans', system-ui, sans-serif;
  --font-mono:    'IBM Plex Mono', 'Courier New', monospace;

  /* Type Scale */
  --text-11:  0.6875rem;   /* 11px */
  --text-13:  0.8125rem;   /* 13px */
  --text-16:  1rem;        /* 16px */
  --text-20:  1.25rem;     /* 20px */
  --text-28:  1.75rem;     /* 28px */
  --text-40:  2.5rem;      /* 40px */
  --text-56:  3.5rem;      /* 56px */
  --text-80:  5rem;        /* 80px */
  --text-120: 7.5rem;      /* 120px */

  /* ─────────────────────────────────────────
     SPACING
  ───────────────────────────────────────── */

  --s4:   0.25rem;   /*   4px */
  --s8:   0.5rem;    /*   8px */
  --s16:  1rem;      /*  16px */
  --s24:  1.5rem;    /*  24px */
  --s32:  2rem;      /*  32px */
  --s48:  3rem;      /*  48px */
  --s64:  4rem;      /*  64px */
  --s96:  6rem;      /*  96px */
  --s128: 8rem;      /* 128px */

  /* ─────────────────────────────────────────
     MOTION
  ───────────────────────────────────────── */

  --ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1.0);
  --ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1.0);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1.0);

  --duration-fast:   150ms;
  --duration-base:   280ms;
  --duration-slow:   500ms;
  --duration-slower: 800ms;

  /* ─────────────────────────────────────────
     ELEVATION — SHADOWS
  ───────────────────────────────────────── */

  --shadow-sm: 0 1px 3px rgba(7,12,20,0.08),
               0 1px 2px rgba(7,12,20,0.04);

  --shadow-md: 0 4px 16px rgba(7,12,20,0.10),
               0 2px 6px rgba(7,12,20,0.06);

  --shadow-lg: 0 16px 48px rgba(7,12,20,0.14),
               0 6px 16px rgba(7,12,20,0.08);

  --shadow-xl: 0 32px 80px rgba(7,12,20,0.20),
               0 12px 32px rgba(7,12,20,0.12);

  /* ─────────────────────────────────────────
     BORDER RADIUS
  ───────────────────────────────────────── */

  --radius-sm: 3px;    /* buttons, badges, inputs */
  --radius-md: 6px;    /* small cards, swatches, toast */
  --radius-lg: 12px;   /* main cards, panels, wrappers */

}
```

### Base Reset

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html { scroll-behavior: smooth; }

body {
  background: var(--bone);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}

img, svg { display: block; max-width: 100%; }
a { color: inherit; text-decoration: none; }
button { cursor: pointer; border: none; background: none; font-family: inherit; }
```

---

*DS1 — Silver Empire · v2.0 · EMPIRE Design Studio*
*"Power through restraint. Authority through typography. Gold with parsimony."*
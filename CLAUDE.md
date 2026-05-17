@AGENTS.md


# 444 — Golf Social App

## What this is
React Native + Expo Router app. Social golf round organizer — Partiful for golf.
Two platforms: iOS and Android from one codebase.

## Stack
- React Native + Expo SDK (latest)
- Expo Router for navigation (file-based)
- Supabase for database, auth (phone OTP), real-time
- TypeScript throughout — no any types

## Design system
All colors and fonts live in constants/theme.ts — never hardcode values inline.

Colors:
- Green: #284726
- Cream: #d8d6af  
- Cream light: #f0ede0
- Background: #f5f2e8
- Card: #ffffff
- Border: #e8e3d0
- Muted text: #9a9880
- Primary text: #1a1a18

Fonts:
- Cormorant Garamond (serif) — wordmark, course names, scores, headlines, profile name
- DM Sans — all UI chrome, labels, buttons, body

## Critical React Native rules
- Circles: ALWAYS use explicit px for width, height, AND borderRadius (= width/2). Never 50%.
  CORRECT: width:32, height:32, borderRadius:16
  WRONG: borderRadius:'50%'
- Flexbox defaults to column direction in RN, not row
- No CSS cascade — every style is scoped to its component
- Use StyleSheet.create() for all styles, not inline objects
- px values are density-independent points, not pixels

## File structure
app/
  (tabs)/
    index.tsx        — Home screen
    profile.tsx      — Profile screen
  create.tsx         — Create round (modal)
  invite/[id].tsx    — Public invite page
  scorecard/[id].tsx — Live scorecard
  post-round/[id].tsx — Summary screen
components/
  Wordmark.tsx       — "444." in Cormorant Garamond
  Avatar.tsx         — Circular avatar with initials
  Card.tsx           — White rounded card container
  Button.tsx         — Primary / secondary / maybe variants
constants/
  theme.ts           — All colors, fonts, spacing
lib/
  supabase.ts        — Supabase client

## Supabase tables
rounds, round_players, scores, profiles
(full schema in lib/schema.sql)

## When compacting
Preserve: current screen being built, list of completed screens, any bugs found on device.
// heyjule — visual language, take two.
// Inspired by perk.com: cool concrete gray surfaces, massive bold grotesk ink,
// one flat lime accent, off-black panels, pills. Flat and crisp — no warmth, no texture.

export const colors = {
  ink: '#20211F',
  inkSoft: '#5F625D',
  cream: '#F5F5F1',
  creamDeep: '#EAEBE5',
  pistachio: '#DCE6DC',
  pistachioDeep: '#5F7564',
  tennis: '#D3E0D1',
  tennisGlow: 'rgba(95, 117, 100, 0.14)',
  muted: '#8A8D87',
  rule: '#E2E3DE',
  paper: '#FCFCFA',
};

// The cycle phase is the ambient temperature of the surface itself —
// barely-there adult tints; the phase strip carries the explicit signal.
export const phaseTint: Record<Phase, string> = {
  menstrual: '#F5F0EF',
  follicular: '#F1F4EF',
  ovulation: '#F3F5EF',
  luteal: '#F2F2EE',
};

// Saturated-but-sober phase colors for the GitHub-style strip.
export const phaseStrong: Record<Phase, string> = {
  menstrual: '#C9A4A2',
  follicular: '#9EB49C',
  ovulation: '#B8C99F',
  luteal: '#B8B7AF',
};

export type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export const phaseLabel: Record<Phase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

export const fonts = {
  // Hanken Grotesk — the bold, tight grotesk voice
  display: 'HankenGrotesk_800ExtraBold',
  displaySoft: 'HankenGrotesk_600SemiBold',
  body: 'HankenGrotesk_400Regular',
  bodyItalic: 'HankenGrotesk_400Regular_Italic',
  // IBM Plex Mono — instrument voice: timestamps, values, provenance
  mono: 'IBMPlexMono_400Regular',
  monoMed: 'IBMPlexMono_500Medium',
};

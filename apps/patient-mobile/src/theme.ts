// heyjule — visual language, take two.
// Inspired by perk.com: cool concrete gray surfaces, massive bold grotesk ink,
// one flat lime accent, off-black panels, pills. Flat and crisp — no warmth, no texture.

export const colors = {
  ink: '#171714',
  inkSoft: '#45453F',
  // token kept from v1 but now an airy green-white surface, NOT beige, NOT gray
  cream: '#F1F3EA',
  creamDeep: '#E3E7D8',
  pistachio: '#A3C55B',
  pistachioDeep: '#6C8A34',
  tennis: '#B6DF48',
  tennisGlow: 'rgba(182, 223, 72, 0.5)',
  muted: '#82827A',
  rule: '#D8DCCC',
  paper: '#FFFFFF', // card white
};

// The cycle phase is the ambient temperature of the surface itself —
// light, optimistic pastels. Never beige, never gloom.
export const phaseTint: Record<Phase, string> = {
  menstrual: '#F7E7E8', // soft rose
  follicular: '#EAF2DC', // fresh green
  ovulation: '#F0F7CD', // brightest, lime
  luteal: '#F0EEE8', // calm neutral-light
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

// heyjule — visual language, take two.
// Inspired by perk.com: cool concrete gray surfaces, massive bold grotesk ink,
// one flat lime accent, off-black panels, pills. Flat and crisp — no warmth, no texture.

export const colors = {
  ink: '#171714',
  inkSoft: '#45453F',
  // token kept from v1 but now the concrete surface, NOT beige
  cream: '#D5D5D0',
  creamDeep: '#C6C6C0',
  pistachio: '#9FBE4F',
  pistachioDeep: '#647E2E',
  tennis: '#AFD649',
  tennisGlow: 'rgba(175, 214, 73, 0.5)',
  muted: '#73736B',
  rule: '#BDBDB6',
  paper: '#F2F2ED', // card white
};

// The cycle phase is the ambient temperature of the surface itself —
// whispers of hue inside the concrete gray, never beige.
export const phaseTint: Record<Phase, string> = {
  menstrual: '#D9CDCC', // rose-gray
  follicular: '#CFD4CB', // green-gray
  ovulation: '#D5DCBE', // lime-gray, brightest
  luteal: '#D6D2CF', // warm-gray
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

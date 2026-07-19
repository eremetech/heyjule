// heyjule — visual language, take two.
// Inspired by perk.com: cool concrete gray surfaces, massive bold grotesk ink,
// one flat lime accent, off-black panels, pills. Flat and crisp — no warmth, no texture.

export const colors = {
  ink: '#171714',
  inkSoft: '#45453F',
  // token kept from v1 but now the light concrete surface, NOT beige
  cream: '#E9E9E4',
  creamDeep: '#DBDBD5',
  pistachio: '#9FBE4F',
  pistachioDeep: '#66832F',
  tennis: '#B4DC4C',
  tennisGlow: 'rgba(180, 220, 76, 0.5)',
  muted: '#7C7C74',
  rule: '#CBCBC4',
  paper: '#F9F9F5', // card white
};

// The cycle phase is the ambient temperature of the surface itself —
// light, alive whispers of hue inside the concrete, never beige.
export const phaseTint: Record<Phase, string> = {
  menstrual: '#EFE1E1', // soft rose
  follicular: '#E2EBD8', // fresh green
  ovulation: '#EAF2CB', // brightest, lime
  luteal: '#EBE8E1', // quiet warm-gray
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

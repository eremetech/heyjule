export const colors = {
  canvas: "#FBF8F5",
  canvasDeep: "#F5F0EB",
  ink: "#30302E",
  inkSoft: "#76716C",
  inkFaint: "#AAA39C",
  line: "rgba(83, 71, 61, 0.10)",
  lineStrong: "rgba(83, 71, 61, 0.17)",
  white: "#FFFFFF",
  coral: "#E98079",
  coralVivid: "#E95031",
  coralSoft: "#F5C8BE",
  peach: "#F3B97D",
  peachSoft: "#F8DFC5",
  blush: "#F1A8A2",
  olive: "#889460",
  oliveDeep: "#727C4F",
  sage: "#AAB68A",
  amber: "#C89D55",
  success: "#71865A",
} as const;

export const typography = {
  display: "Newsreader_400Regular",
  displayMedium: "Newsreader_500Medium",
} as const;

export const shadows = {
  quiet: {
    shadowColor: "#4B3C32",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
    elevation: 3,
  },
  lifted: {
    shadowColor: "#3E3027",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.15,
    shadowRadius: 26,
    elevation: 8,
  },
} as const;

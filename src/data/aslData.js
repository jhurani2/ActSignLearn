export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const ASL_HINTS = {
  A: "Fingers curled, thumb beside index",
  B: "Four fingers up, thumb tucked",
  C: "Hand curved like the letter C",
  D: "Index up, others curl to touch thumb",
  E: "All fingers curl down to thumb",
  F: "Index & thumb touch, others up",
  G: "Index & thumb point sideways",
  H: "Index & middle point sideways",
  I: "Pinky up, others closed",
  J: "Pinky up, draw a J motion",
  K: "Index & middle up, thumb between",
  L: "Index up, thumb out — L shape",
  M: "Three fingers over thumb",
  N: "Two fingers over thumb",
  O: "All fingers curve to touch thumb",
  P: "Like K but pointing down",
  Q: "Like G but pointing down",
  R: "Index & middle crossed",
  S: "Fist with thumb over fingers",
  T: "Thumb between index & middle",
  U: "Index & middle up together",
  V: "Index & middle up, spread apart",
  W: "Three fingers up, spread",
  X: "Index finger hooked",
  Y: "Thumb & pinky out",
  Z: "Index draws a Z in the air",
};

export const ASL_STEPS = {
  A: [
    "Hold your dominant hand up, palm facing outward",
    "Curl all four fingers into a fist",
    "Place thumb beside your index finger, not over it",
  ],
  B: [
    "Hold your dominant hand up, palm facing outward",
    "Extend all four fingers straight up, held together",
    "Tuck your thumb across your palm",
  ],
  C: [
    "Hold your hand up, palm facing sideways",
    "Curve all fingers and thumb into a C shape",
    "Keep the opening facing to the side",
  ],
};

export const getSteps = (letter) =>
  ASL_STEPS[letter] || [
    "Hold your dominant hand up, palm facing outward",
    ASL_HINTS[letter],
    "Hold steady for 1–2 seconds",
  ];

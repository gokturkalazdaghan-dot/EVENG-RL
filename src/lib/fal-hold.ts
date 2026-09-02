type Cups = [string | null, string | null, string | null];

let cups: Cups = [null, null, null];
let palm: string | null = null;
let dream = "";

export function loadFalHold() {
  return { cups, palm, dream };
}

export function saveFalCups(next: Cups) {
  cups = next;
}

export function saveFalPalm(next: string | null) {
  palm = next;
}

export function saveFalDream(next: string) {
  dream = next;
}

export function clearFalHold() {
  cups = [null, null, null];
  palm = null;
  dream = "";
}

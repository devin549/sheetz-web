// Self-contained Code-39 barcode generator (no dependency). Code-39 needs no checksum and scans with
// any cheap 1D scanner — perfect for bin/part labels. Returns bar rectangles for an SVG.
// Each char = 9 elements (bar,space,…,bar); 'w' = wide (3×), 'n' = narrow.
const CODE39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn',
  'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn',
  'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
  'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn',
  'Z': 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
  '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
};

export const code39Clean = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '');

// → { width, height, bars: [{x, w}] }  (bars are black rects; spaces are gaps)
export function code39Bars(text, { narrow = 2, height = 56, quiet = 20 } = {}) {
  const data = '*' + code39Clean(text) + '*';
  let x = quiet; const bars = [];
  for (const ch of data) {
    const pat = CODE39[ch]; if (!pat) continue;
    for (let e = 0; e < 9; e++) {
      const w = pat[e] === 'w' ? narrow * 3 : narrow;
      if (e % 2 === 0) bars.push({ x, w }); // even index = bar
      x += w;
    }
    x += narrow; // inter-character narrow gap
  }
  return { width: x + quiet, height, bars };
}

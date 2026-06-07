const styles = {
  // Reset
  reset: [[0], [0]],

  // Text styles
  bold: [[1], [22]],
  dim: [[2], [22]],
  italic: [[3], [23]],
  underline: [[4], [24]],
  inverse: [[7], [27]],
  hidden: [[8], [28]],
  strikethrough: [[9], [29]],

  // Foreground colors
  black: [[30], [39]],
  red: [[31], [39]],
  green: [[32], [39]],
  yellow: [[33], [39]],
  blue: [[34], [39]],
  magenta: [[35], [39]],
  cyan: [[36], [39]],
  white: [[37], [39]],
  gray: [[90], [39]],
  grey: [[90], [39]],

  // Bright foreground colors
  brightRed: [[91], [39]],
  brightGreen: [[92], [39]],
  brightYellow: [[93], [39]],
  brightBlue: [[94], [39]],
  brightMagenta: [[95], [39]],
  brightCyan: [[96], [39]],
  brightWhite: [[97], [39]],

  // Additional colors
  orange: [[38, 5, 208], [39]],
  purple: [[38, 5, 129], [39]],
  pink: [[38, 5, 213], [39]],
  lime: [[38, 5, 46], [39]],
  teal: [[38, 5, 30], [39]],
  violet: [[38, 5, 93], [39]],

  // Custom true-color foreground
  constructionYellow: [[38, 2, 206, 173, 73], [39]],
  moneyGreen: [[38, 2, 37, 168, 103], [39]],
  indigo: [[38, 2, 128, 114, 174], [39]],

  // Background colors
  bgBlack: [[40], [49]],
  bgRed: [[41], [49]],
  bgGreen: [[42], [49]],
  bgYellow: [[43], [49]],
  bgBlue: [[44], [49]],
  bgMagenta: [[45], [49]],
  bgCyan: [[46], [49]],
  bgWhite: [[47], [49]],

  // Bright background colors
  bgBrightRed: [[101], [49]],
  bgBrightGreen: [[102], [49]],
  bgBrightYellow: [[103], [49]],
  bgBrightBlue: [[104], [49]],
  bgBrightMagenta: [[105], [49]],
  bgBrightCyan: [[106], [49]],
  bgBrightWhite: [[107], [49]],

  // Additional background colors
  bgOrange: [[48, 5, 208], [49]],
  bgPurple: [[48, 5, 129], [49]],
  bgPink: [[48, 5, 213], [49]],
  bgLime: [[48, 5, 46], [49]],
  bgTeal: [[48, 5, 30], [49]],
  bgViolet: [[48, 5, 93], [49]],

  // Custom true-color background
  bgConstructionYellow: [[48, 2, 206, 173, 73], [49]],
  bgMoneyGreen: [[48, 2, 37, 168, 103], [49]],
  bgIndigo: [[48, 2, 128, 114, 174], [49]],
};

const createColorFunction = (open, close) => {
  const openCode = `\x1b[${open.join(';')}m`;
  const closeCode = close ? `\x1b[${close.join(';')}m` : '';
  return (text = '') => `${openCode}${text}${closeCode}`;
};

const color = {};

for (const [name, [open, close]] of Object.entries(styles)) {
  color[name] = createColorFunction(open, close);
  // Add open-only versions (capitalize first letter for naming)
  const openName = `open_${name}`;
  color[openName] = createColorFunction(open, null);
}

// Chainable API
const createChainable = () => {
  const stack = [];

  const handler = {
    get(target, prop) {
      if (prop === 'apply') {
        return (text) => {
          let result = text;
          for (const [open, close] of stack) {
            result = `\x1b[${open.join(';')}m${result}\x1b[${close.join(';')}m`;
          }
          return result;
        };
      }

      if (styles[prop]) {
        stack.push(styles[prop]);
        return new Proxy(() => { }, handler);
      }

      return target[prop];
    },
    apply(target, thisArg, args) {
      return handler.get(target, 'apply')(args[0]);
    }
  };

  return new Proxy(() => { }, handler);
};

// Export both simple and chainable APIs
export default color;
export const chain = createChainable;

// Strip ANSI escape sequences from a string to get its visual length
color.stripAnsi = function (str) {
  // ANSI escape sequence regex pattern - matches SGR codes (m) and other sequences like bracketed paste mode
  // Handles: \x1b[...m (color codes), \x1b[?...h (modes), \x1b[...h/l etc
  const ansiRegex = /\x1b\[[0-9;?]*[a-zA-Z]/g;
  return str.replace(ansiRegex, '');
};

// Individual exports
export const {
  reset, bold, dim, italic, underline, inverse, hidden, strikethrough,
  black, red, green, yellow, blue, magenta, cyan, white, gray, grey,
  brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
  orange, purple, pink, lime, teal, violet,
  constructionYellow, moneyGreen, indigo,
  bgBlack, bgRed, bgGreen, bgYellow, bgBlue, bgMagenta, bgCyan, bgWhite,
  bgBrightRed, bgBrightGreen, bgBrightYellow, bgBrightBlue, bgBrightMagenta, bgBrightCyan, bgBrightWhite,
  bgOrange, bgPurple, bgPink, bgLime, bgTeal, bgViolet,
  bgConstructionYellow, bgMoneyGreen, bgIndigo
} = color;
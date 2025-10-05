const styles = {
  // Reset
  reset: [0, 0],

  // Text styles
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],

  // Foreground colors
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  gray: [90, 39],
  grey: [90, 39],

  // Background colors
  bgBlack: [40, 49],
  bgRed: [41, 49],
  bgGreen: [42, 49],
  bgYellow: [43, 49],
  bgBlue: [44, 49],
  bgMagenta: [45, 49],
  bgCyan: [46, 49],
  bgWhite: [47, 49],
};

const createColorFunction = (open, close) => {
  return (text) => `\x1b[${open}m${text}\x1b[${close}m`;
};

const color = {};

for (const [name, [open, close]] of Object.entries(styles)) {
  color[name] = createColorFunction(open, close);
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
            result = `\x1b[${open}m${result}\x1b[${close}m`;
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

// Individual exports
export const {
  reset, bold, dim, italic, underline, inverse, hidden, strikethrough,
  black, red, green, yellow, blue, magenta, cyan, white, gray, grey,
  bgBlack, bgRed, bgGreen, bgYellow, bgBlue, bgMagenta, bgCyan, bgWhite
} = color;
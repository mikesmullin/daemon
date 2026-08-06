import { plugin } from "bun";
import { readFileSync } from "fs";
import coffeescript from "coffeescript";
plugin({
  name: "coffeescript-loader",
  setup(build) {
    build.onLoad({ filter: /\.coffee$/ }, async (args) => {
      const source = readFileSync(args.path, "utf8");
      const js = coffeescript.compile(source, { bare: true });
      return { contents: js, loader: "js" };
    });
  },
});

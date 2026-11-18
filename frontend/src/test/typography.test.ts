import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const tokens = readFileSync("src/styles/tokens.css", "utf8");
const fonts = readFileSync("src/styles/fonts.css", "utf8");
const globalStyles = readFileSync("src/styles/global.css", "utf8");

it("uses the bundled Inter body / Plus Jakarta Sans heading stacks with Vietnamese-safe fallbacks", () => {
  const style = document.createElement("style");
  style.textContent = `${tokens}\n${globalStyles}`;
  document.head.append(style);
  try {
    const rules = Array.from(style.sheet!.cssRules).filter(
      (rule): rule is CSSStyleRule => rule.type === 1,
    );
    const declaration = (selector: string) => rules.find(
      (rule) => rule.selectorText.replace(/\s/g, "") === selector.replace(/\s/g, ""),
    )!.style;
    const root = declaration(":root");
    expect(root.getPropertyValue("--font-sans").split(",").map((font) => font.trim()))
      .toEqual(['"Inter"', '"Segoe UI"', "system-ui", "-apple-system", "Arial", "sans-serif"]);
    expect(root.getPropertyValue("--font-display").split(",").map((font) => font.trim()))
      .toEqual(['"Plus Jakarta Sans"', '"Inter"', '"Segoe UI"', "sans-serif"]);
    expect(declaration("body").getPropertyValue("font")).toContain("var(--font-sans)");
    expect(declaration("h1, h2").getPropertyValue("font-family")).toBe("var(--font-display)");
    expect(declaration("button, input, textarea, select").getPropertyValue("font")).toBe("inherit");
    // Fonts are self-hosted (no runtime CDN) and include the Vietnamese subset.
    expect(`${tokens}\n${globalStyles}\n${fonts}`).not.toMatch(/Georgia|Times New Roman|@import|fonts\.googleapis|fonts\.gstatic/);
    expect(fonts).toMatch(/U\+1EA0-1EF9/);
  } finally {
    style.remove();
  }
});

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const tokens = readFileSync("src/styles/tokens.css", "utf8");
const globalStyles = readFileSync("src/styles/global.css", "utf8");

it("uses the existing system sans stack for Vietnamese headings, titles and inherited UI text", () => {
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
      .toEqual(['"Segoe UI"', "system-ui", "-apple-system", "Arial", "sans-serif"]);
    expect(root.getPropertyValue("--font-display").trim()).toBe("var(--font-sans)");
    expect(declaration("body").getPropertyValue("font")).toContain("var(--font-sans)");
    expect(declaration("h1, h2").getPropertyValue("font-family")).toBe("var(--font-display)");
    expect(declaration("button, input, textarea, select").getPropertyValue("font")).toBe("inherit");
    expect(`${tokens}\n${globalStyles}`).not.toMatch(/Georgia|Times New Roman|@import/);
  } finally {
    style.remove();
  }
});

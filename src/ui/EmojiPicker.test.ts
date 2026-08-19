import { describe, expect, it } from "vitest";
import { EMOJI_CATEGORIES } from "./EmojiPicker";

describe("EmojiPicker Data & Filter Logic", () => {
  it("defines categories with valid emoji items", () => {
    expect(EMOJI_CATEGORIES.length).toBeGreaterThan(0);
    const smileys = EMOJI_CATEGORIES.find((cat) => cat.id === "smileys");
    expect(smileys).toBeDefined();
    expect(smileys?.emojis.length).toBeGreaterThan(0);
  });

  it("contains keywords for searching", () => {
    const fireCategory = EMOJI_CATEGORIES.find((cat) => cat.id === "reactions");
    const fireEmoji = fireCategory?.emojis.find((e) => e.emoji === "🔥");
    expect(fireEmoji).toBeDefined();
    expect(fireEmoji?.keywords).toContain("fire");
  });

  it("allows filtering emojis by search term across categories", () => {
    const query = "heart";
    const matching: string[] = [];

    for (const category of EMOJI_CATEGORIES) {
      for (const item of category.emojis) {
        if (
          item.name.toLowerCase().includes(query) ||
          item.keywords.some((kw) => kw.toLowerCase().includes(query))
        ) {
          matching.push(item.emoji);
        }
      }
    }

    expect(matching.length).toBeGreaterThan(0);
    expect(matching).toContain("❤️");
    expect(matching).toContain("😍");
  });
});

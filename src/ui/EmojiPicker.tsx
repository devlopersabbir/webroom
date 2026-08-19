import React, { useMemo, useState } from "react";

export interface EmojiItem {
  emoji: string;
  name: string;
  keywords: string[];
}

export interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: EmojiItem[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    name: "Smileys & Emotions",
    icon: "😀",
    emojis: [
      { emoji: "😀", name: "grinning face", keywords: ["smile", "happy", "joy", "grin"] },
      { emoji: "😃", name: "grinning face with big eyes", keywords: ["smile", "happy", "joy"] },
      { emoji: "😄", name: "grinning face with smiling eyes", keywords: ["laugh", "happy", "smile"] },
      { emoji: "😁", name: "beaming face with smiling eyes", keywords: ["grin", "smile", "happy"] },
      { emoji: "😆", name: "grinning squinting face", keywords: ["laugh", "haha", "lol"] },
      { emoji: "😅", name: "grinning face with sweat", keywords: ["phew", "sweat", "nervous"] },
      { emoji: "😂", name: "face with tears of joy", keywords: ["laugh", "cry", "lol", "rofl"] },
      { emoji: "🤣", name: "rolling on the floor laughing", keywords: ["rofl", "lol", "laugh"] },
      { emoji: "😊", name: "smiling face with smiling eyes", keywords: ["smile", "blush", "kind"] },
      { emoji: "😇", name: "smiling face with halo", keywords: ["angel", "innocent"] },
      { emoji: "🥰", name: "smiling face with hearts", keywords: ["love", "heart", "adoring"] },
      { emoji: "😍", name: "smiling face with heart-eyes", keywords: ["love", "heart", "eyes"] },
      { emoji: "🤩", name: "star-struck", keywords: ["star", "eyes", "wow", "amazed"] },
      { emoji: "😘", name: "face blowing a kiss", keywords: ["kiss", "love"] },
      { emoji: "😋", name: "face savoring food", keywords: ["yum", "tasty", "delicious"] },
      { emoji: "😎", name: "smiling face with sunglasses", keywords: ["cool", "glasses", "sunglasses"] },
      { emoji: "🥳", name: "partying face", keywords: ["party", "celebrate", "horn"] },
      { emoji: "🤯", name: "exploding head", keywords: ["mindblown", "shock", "boom"] },
      { emoji: "🤔", name: "thinking face", keywords: ["think", "ponder", "curious"] },
      { emoji: "😏", name: "smirking face", keywords: ["smirk", "sly"] },
      { emoji: "😌", name: "relieved face", keywords: ["relieved", "peaceful", "calm"] },
      { emoji: "😴", name: "sleeping face", keywords: ["sleep", "zzz", "tired"] },
      { emoji: "😭", name: "loudly crying face", keywords: ["cry", "sad", "tears", "sob"] },
      { emoji: "😱", name: "face screaming in fear", keywords: ["scream", "fear", "scared"] },
      { emoji: "😡", name: "enraged face", keywords: ["angry", "mad", "rage"] },
    ],
  },
  {
    id: "gestures",
    name: "Hands & Gestures",
    icon: "👍",
    emojis: [
      { emoji: "👍", name: "thumbs up", keywords: ["like", "yes", "good", "agree", "thumb"] },
      { emoji: "👎", name: "thumbs down", keywords: ["dislike", "no", "bad", "thumb"] },
      { emoji: "👏", name: "clapping hands", keywords: ["clap", "bravo", "applause"] },
      { emoji: "🙌", name: "raising hands", keywords: ["hooray", "hands", "celebrate"] },
      { emoji: "🤝", name: "handshake", keywords: ["deal", "agree", "partner"] },
      { emoji: "🙏", name: "folded hands", keywords: ["please", "thank", "pray", "hope"] },
      { emoji: "✌️", name: "victory hand", keywords: ["peace", "two", "victory"] },
      { emoji: "🫡", name: "saluting face", keywords: ["respect", "salute", "yes"] },
      { emoji: "💪", name: "flexed biceps", keywords: ["strong", "power", "muscle"] },
      { emoji: "👋", name: "waving hand", keywords: ["wave", "hello", "hi", "bye"] },
      { emoji: "🖐️", name: "hand with fingers splayed", keywords: ["five", "stop", "hand"] },
      { emoji: "🤞", name: "crossed fingers", keywords: ["luck", "hope", "wish"] },
      { emoji: "🤟", name: "love-you gesture", keywords: ["love", "rock"] },
      { emoji: "🤙", name: "call me hand", keywords: ["phone", "call", "hangten"] },
      { emoji: "👉", name: "backhand index pointing right", keywords: ["point", "right"] },
      { emoji: "👈", name: "backhand index pointing left", keywords: ["point", "left"] },
    ],
  },
  {
    id: "reactions",
    name: "Reactions & Symbols",
    icon: "✨",
    emojis: [
      { emoji: "❤️", name: "red heart", keywords: ["love", "heart", "like"] },
      { emoji: "🔥", name: "fire", keywords: ["lit", "hot", "flame", "fire"] },
      { emoji: "✨", name: "sparkles", keywords: ["sparkle", "magic", "stars", "clean"] },
      { emoji: "🚀", name: "rocket", keywords: ["rocket", "ship", "launch", "fast"] },
      { emoji: "🎉", name: "party popper", keywords: ["tada", "party", "celebrate"] },
      { emoji: "💯", name: "hundred points", keywords: ["100", "perfect", "full"] },
      { emoji: "💡", name: "light bulb", keywords: ["idea", "bright", "think"] },
      { emoji: "💬", name: "speech balloon", keywords: ["chat", "comment", "message"] },
      { emoji: "⚡", name: "high voltage", keywords: ["zap", "bolt", "electric", "fast"] },
      { emoji: "🌟", name: "glowing star", keywords: ["star", "shine", "bright"] },
      { emoji: "🎯", name: "bullseye", keywords: ["target", "hit", "goal"] },
      { emoji: "⭐", name: "star", keywords: ["star", "rating"] },
      { emoji: "🏆", name: "trophy", keywords: ["winner", "cup", "award"] },
      { emoji: "👀", name: "eyes", keywords: ["look", "see", "watch", "eyes"] },
      { emoji: "❌", name: "cross mark", keywords: ["no", "cancel", "wrong"] },
      { emoji: "✅", name: "check mark button", keywords: ["yes", "done", "ok", "check"] },
    ],
  },
  {
    id: "fun",
    name: "Food & Objects",
    icon: "🍕",
    emojis: [
      { emoji: "🍕", name: "pizza", keywords: ["food", "slice", "pizza"] },
      { emoji: "☕", name: "hot beverage", keywords: ["coffee", "tea", "drink"] },
      { emoji: "🍻", name: "clinking beer mugs", keywords: ["beer", "cheers", "drink"] },
      { emoji: "🍔", name: "hamburger", keywords: ["food", "burger"] },
      { emoji: "🎂", name: "birthday cake", keywords: ["cake", "birthday", "party"] },
      { emoji: "⚽", name: "soccer ball", keywords: ["ball", "sports", "football"] },
      { emoji: "🎮", name: "video game", keywords: ["game", "controller", "play"] },
      { emoji: "📱", name: "mobile phone", keywords: ["phone", "smartphone"] },
      { emoji: "💻", name: "laptop", keywords: ["computer", "code", "tech"] },
      { emoji: "🎵", name: "musical note", keywords: ["music", "song", "note"] },
      { emoji: "🎈", name: "balloon", keywords: ["party", "balloon", "birthday"] },
      { emoji: "🎁", name: "wrapped gift", keywords: ["present", "gift", "surprise"] },
    ],
  },
];

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelectEmoji }) => {
  const [activeTab, setActiveTab] = useState<string>("smileys");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredEmojis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      const category = EMOJI_CATEGORIES.find((cat) => cat.id === activeTab);
      return category ? category.emojis : [];
    }

    // Search across all categories
    const results: EmojiItem[] = [];
    const seen = new Set<string>();

    for (const category of EMOJI_CATEGORIES) {
      for (const item of category.emojis) {
        if (seen.has(item.emoji)) continue;
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesKeyword = item.keywords.some((kw) => kw.toLowerCase().includes(q));

        if (matchesName || matchesKeyword) {
          results.push(item);
          seen.add(item.emoji);
        }
      }
    }
    return results;
  }, [activeTab, searchQuery]);

  return (
    <div
      className="webroom-emoji-picker"
      role="dialog"
      aria-label="Emoji Picker"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search Header */}
      <div className="webroom-emoji-search-wrapper">
        <span className="webroom-emoji-search-icon">🔍</span>
        <input
          type="text"
          className="webroom-emoji-search-input"
          placeholder="Search emojis..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
        {searchQuery && (
          <button
            type="button"
            className="webroom-emoji-search-clear"
            onClick={() => setSearchQuery("")}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Tabs */}
      {!searchQuery && (
        <div className="webroom-emoji-tabs">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`webroom-emoji-tab-btn ${activeTab === cat.id ? "webroom-emoji-tab-active" : ""}`}
              onClick={() => setActiveTab(cat.id)}
              title={cat.name}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji Grid */}
      <div className="webroom-emoji-grid">
        {filteredEmojis.length === 0 ? (
          <div className="webroom-emoji-empty">No emojis found</div>
        ) : (
          filteredEmojis.map((item) => (
            <button
              key={item.emoji}
              type="button"
              className="webroom-emoji-item"
              onClick={() => onSelectEmoji(item.emoji)}
              title={`${item.emoji} (${item.name})`}
              aria-label={item.name}
            >
              {item.emoji}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

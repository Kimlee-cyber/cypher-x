import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // Check if input looks like a Solana CA (base58)
  if (!text || text.length < 30) return;

  bot.sendMessage(chatId, "🔍 Fetching token info...");

  try {
    // Fetch token info from DexScreener
    const url = `https://api.dexscreener.com/latest/dex/tokens/${text}`;
    const { data } = await axios.get(url);

    if (!data.pairs || data.pairs.length === 0) {
      bot.sendMessage(chatId, "❌ No token data found for this address.");
      return;
    }

    const token = data.pairs[0];
    const msgText = `
*${token.baseToken.symbol}* — ${token.baseToken.name}

💰 *Price:* $${Number(token.priceUsd).toFixed(6)}
💧 *Liquidity:* $${token.liquidity?.usd?.toLocaleString() || "N/A"}
📊 *24h Volume:* $${token.volume?.h24?.toLocaleString() || "N/A"}

🔗 [View Chart](${token.url})
`;

    bot.sendMessage(chatId, msgText, { parse_mode: "Markdown", disable_web_page_preview: true });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "⚠️ Error fetching token info.");
  }
});

console.log("✅ Solana Token Info Bot is running...");

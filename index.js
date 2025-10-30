import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

if (!BOT_TOKEN) {
  console.error("❌ Missing BOT_TOKEN in environment variables. Exiting.");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const connection = new Connection(RPC_URL, "confirmed");

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // Basic validation for Solana contract address
  if (!text || text.length < 30) return;

  try {
    // Fetch token info from DexScreener
    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${text}`;
    const { data } = await axios.get(dexUrl);

    if (!data?.pairs || data.pairs.length === 0) {
      await bot.sendMessage(chatId, "❌ No token data found for this address.");
      return;
    }

    const token = data.pairs[0];
    const { baseToken, priceUsd, priceNative, liquidity, volume } = token;

    // Fetch decimals & supply from Solana RPC
    let decimals = "N/A";
    let supply = "N/A";
    try {
      const mintPubkey = new PublicKey(text);
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      const mintData = mintInfo?.value?.data?.parsed?.info;
      if (mintData) {
        decimals = mintData.decimals ?? "N/A";
        const totalSupply = (mintData.supply ?? 0) / (10 ** (decimals || 0));
        supply = Number.isFinite(totalSupply) ? totalSupply.toLocaleString() : "N/A";
      }
    } catch (rpcErr) {
      console.warn("Could not fetch decimals/supply:", rpcErr?.message || rpcErr);
    }

    const logo = baseToken?.logoURI || token?.info?.imageUrl || null;
    const logoText = logo ? `<a href="${logo}">🖼️ Token Logo</a>` : "";

    // ✅ Chart link moved back to bottom
    const msgText = `
*${baseToken?.symbol || "N/A"}* — ${baseToken?.name || "Unknown"}

💰 *Price:* $${Number(priceUsd ?? 0).toFixed(6)}
💎 *Price (SOL):* ${Number(priceNative ?? 0).toFixed(6)} SOL
💧 *Liquidity:* $${(liquidity?.usd ?? "N/A").toLocaleString()}
📊 *24h Volume:* $${(volume?.h24 ?? "N/A").toLocaleString()}
🔢 *Decimals:* ${decimals}
📦 *Supply:* ${supply}

🔗 [View Chart](${token.url})
${logoText}
`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "📋 Copy CA", callback_data: `copy_${text}` },
          { text: "📊 View Chart", url: token.url }
        ]
      ]
    };

    await bot.sendMessage(chatId, msgText, {
      parse_mode: "Markdown",
      disable_web_page_preview: false,
      reply_markup: keyboard
    });
  } catch (err) {
    console.error("Error in message handler:", err?.message || err);
    await bot.sendMessage(chatId, "⚠️ Error fetching token info. Try again later.");
  }
});

bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data && data.startsWith("copy_")) {
      const ca = data.replace("copy_", "");
      await bot.answerCallbackQuery(query.id, { text: "✅ CA copied!" });
      await bot.sendMessage(chatId, `📋 *Contract Address:*\n\`${ca}\``, {
        parse_mode: "Markdown"
      });
    } else {
      await bot.answerCallbackQuery(query.id);
    }
  } catch (err) {
    console.warn("Callback handler error:", err);
  }
});

console.log("✅ Solana Token Info Bot is live (Render-ready).");

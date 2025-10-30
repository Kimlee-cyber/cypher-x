import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const connection = new Connection(process.env.RPC_URL);

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // Check if message looks like a Solana token address (base58, 30+ chars)
  if (!text || text.length < 30) return;

  try {
    // --- Fetch token info from DexScreener ---
    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${text}`;
    const { data } = await axios.get(dexUrl);

    if (!data.pairs || data.pairs.length === 0) {
      bot.sendMessage(chatId, "❌ No token data found for this address.");
      return;
    }

    const token = data.pairs[0];
    const { baseToken, priceUsd, priceNative, liquidity, volume } = token;

    // --- Fetch decimals & supply from Solana RPC ---
    let decimals = "N/A";
    let supply = "N/A";

    try {
      const mintInfo = await connection.getParsedAccountInfo(new PublicKey(text));
      const mintData = mintInfo?.value?.data?.parsed?.info;
      if (mintData) {
        decimals = mintData.decimals;
        const totalSupply = mintData.supply / 10 ** decimals;
        supply = totalSupply.toLocaleString();
      }
    } catch (rpcErr) {
      console.warn("Could not fetch decimals/supply:", rpcErr.message);
    }

    // --- Token logo ---
    let logo = baseToken?.logoURI || token?.info?.imageUrl || null;
    const logoText = logo ? `<a href="${logo}">🖼️ Token Logo</a>` : "";

    // --- Message text ---
    const msgText = `
*${baseToken.symbol}* — ${baseToken.name}

💰 *Price:* $${Number(priceUsd).toFixed(6)}
💎 *Price (SOL):* ${Number(priceNative).toFixed(6)} SOL
💧 *Liquidity:* $${liquidity?.usd?.toLocaleString() || "N/A"}
📊 *24h Volume:* $${volume?.h24?.toLocaleString() || "N/A"}
🔢 *Decimals:* ${decimals}
📦 *Supply:* ${supply}

🔗 [View Chart](${token.url})
${logoText}
`;

    // --- Inline buttons ---
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "📋 Copy CA",
            callback_data: `copy_${text}`,
          },
          {
            text: "📊 View Chart",
            url: token.url,
          },
        ],
      ],
    };

    bot.sendMessage(chatId, msgText, {
      parse_mode: "Markdown",
      disable_web_page_preview: false,
      reply_markup: keyboard,
    });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "⚠️ Error fetching token info. Please try again.");
  }
});

// --- Handle "Copy CA" button click ---
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("copy_")) {
    const ca = data.replace("copy_", "");
    bot.answerCallbackQuery(query.id, { text: "✅ CA copied!" });
    bot.sendMessage(chatId, `📋 *Contract Address:*\n\`${ca}\``, {
      parse_mode: "Markdown",
    });
  }
});

console.log("✅ Solana Token Info Bot with Copy CA button is running...");

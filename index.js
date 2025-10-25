import TelegramBot from "node-telegram-bot-api";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const connection = new Connection(process.env.SOLANA_RPC, "confirmed");

// --- Fetch On-chain Mint Data ---
async function fetchMintData(mintAddress) {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mintPubkey);

    const decimals = mintInfo.decimals;
    const supply = Number(mintInfo.supply) / 10 ** decimals;

    return { decimals, supply };
  } catch (e) {
    throw new Error("Could not fetch mint info.");
  }
}

// --- Fetch Price from DexScreener ---
async function fetchPrice(mintAddress) {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`;
    const { data } = await axios.get(url);

    if (!data.pairs || data.pairs.length === 0) {
      throw new Error("No trading pools found.");
    }

    const pair = data.pairs[0]; // Best pool

    return {
      priceUsd: pair.priceUsd || "N/A",
      liquidityUsd: pair.liquidity?.usd || "N/A",
      volume24h: pair.volume?.h24 || "N/A",
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      logo: pair.info?.imageUrl || pair.baseToken.logoURI || null,
      chart: pair.url
    };
  } catch (e) {
    throw new Error("Could not fetch price.");
  }
}

// --- Format and Send Telegram Message ---
function formatNumber(num) {
  return Number(num).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // Must be a Solana mint address (44 chars)
  if (!text || text.length < 32) return;

  try {
    bot.sendMessage(chatId, "⏳ Fetching token data...");

    const mint = text;
    const mintData = await fetchMintData(mint);
    const priceData = await fetchPrice(mint);

    const caption = `
*${priceData.symbol}* — ${priceData.name}

💰 *Price:* $${formatNumber(priceData.priceUsd)}
💧 *Liquidity:* $${formatNumber(priceData.liquidityUsd)}
📊 *24h Volume:* $${formatNumber(priceData.volume24h)}

🔢 *Decimals:* ${mintData.decimals}
📦 *Supply:* ${formatNumber(mintData.supply)}

🔗 [View Chart](${priceData.chart})
`;

    if (priceData.logo) {
      bot.sendPhoto(chatId, priceData.logo, {
        caption,
        parse_mode: "Markdown"
      });
    } else {
      bot.sendMessage(chatId, caption, { parse_mode: "Markdown" });
    }

  } catch (err) {
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

console.log("✅ Solana Token Info Bot is running...");

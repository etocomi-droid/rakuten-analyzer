import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMultipleUrls } from './lib/url-parser.js';
import { analyzeAllReviews } from './lib/sentence-analyzer.js';
import { generateCrossSummary } from './lib/cross-analyzer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// 静的ファイル配信（Viteなしでも動作）
app.use('/src', express.static(path.join(__dirname, 'src')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const DELAY_MS = 1500;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== 分析結果のインメモリキャッシュ =====
let analysisCache = null; // { products: [...], analyses: [...], summary: {...} }

// ========== URL解析 ==========
app.post('/api/parse-urls', async (req, res) => {
    try {
        const { urls } = req.body;
        if (!urls) return res.status(400).json({ error: 'urls is required' });

        const parsed = parseMultipleUrls(urls);
        if (parsed.length === 0) {
            return res.status(400).json({ error: '有効な楽天商品URLが見つかりませんでした' });
        }

        // 各URLの商品情報を取得
        const products = [];
        for (const p of parsed) {
            const info = await fetchProductInfo(p);
            products.push(info);
            if (parsed.indexOf(p) < parsed.length - 1) await sleep(500);
        }

        res.json({ products });
    } catch (err) {
        console.error('Parse URLs error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== 一括分析 ==========
app.post('/api/analyze', async (req, res) => {
    try {
        const { urls } = req.body;

        let parsed, products;

        if (!urls || urls.trim() === '') {
            // デモモード
            parsed = getDemoParsedUrls();
            products = getDemoProducts();
        } else {
            parsed = parseMultipleUrls(urls);
            if (parsed.length === 0) {
                return res.status(400).json({ error: '有効なURLがありません' });
            }
            // 商品情報取得
            products = [];
            for (const p of parsed) {
                products.push(await fetchProductInfo(p));
                await sleep(300);
            }
        }

        // 各商品のレビューを取得 & 分析
        const productAnalyses = [];
        for (let i = 0; i < products.length; i++) {
            const product = products[i];

            let reviews;
            if (!urls || urls.trim() === '') {
                reviews = getDemoReviewsForProduct(i);
            } else {
                reviews = await scrapeReviewsFromUrl(parsed[i], 3);
            }

            const analysis = analyzeAllReviews(reviews);

            productAnalyses.push({
                productInfo: product,
                analysis,
            });
        }

        // クロス商品サマリ生成
        const summary = generateCrossSummary(productAnalyses);

        // キャッシュに保存
        analysisCache = {
            products,
            analyses: productAnalyses,
            summary,
        };

        res.json({
            products,
            analyses: productAnalyses.map(pa => ({
                productInfo: pa.productInfo,
                totalReviews: pa.analysis.totalReviews,
                totalSentences: pa.analysis.totalSentences,
                averageRating: pa.analysis.averageRating,
                sentimentBreakdown: pa.analysis.sentimentBreakdown,
            })),
            summary,
        });
    } catch (err) {
        console.error('Analyze error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== 個別商品の詳細分析 ==========
app.get('/api/product/:index/details', (req, res) => {
    try {
        if (!analysisCache) {
            return res.status(404).json({ error: '先に分析を実行してください' });
        }
        const idx = parseInt(req.params.index);
        if (idx < 0 || idx >= analysisCache.analyses.length) {
            return res.status(404).json({ error: '商品が見つかりません' });
        }

        const pa = analysisCache.analyses[idx];
        res.json({
            productInfo: pa.productInfo,
            analysis: {
                ...pa.analysis,
                allAnalyzedSentences: pa.analysis.allAnalyzedSentences.map(s => ({
                    originalSentence: s.originalSentence,
                    subject: s.subject,
                    aspect: s.aspect,
                    sentiment: s.sentiment,
                    isRequest: s.isRequest,
                    matchedPositive: s.matchedPositive,
                    matchedNegative: s.matchedNegative,
                    sourceReview: { rating: s.sourceReview.rating },
                })),
            },
        });
    } catch (err) {
        console.error('Product details error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== クロスサマリ ==========
app.get('/api/summary', (req, res) => {
    if (!analysisCache) {
        return res.status(404).json({ error: '先に分析を実行してください' });
    }
    res.json(analysisCache.summary);
});

// ========== 商品情報取得 ==========
async function fetchProductInfo(parsed) {
    try {
        const url = `https://item.rakuten.co.jp/${parsed.shopCode}/${parsed.itemId}/`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'ja',
            },
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        const name = $('title').text().split('|')[0]?.trim() || $('h1').first().text().trim() || `${parsed.shopCode}/${parsed.itemId}`;
        const priceText = $('[class*="price"]').first().text();
        const priceMatch = priceText.match(/[\d,]+/);
        const price = priceMatch ? parseInt(priceMatch[0].replace(/,/g, '')) : 0;

        return {
            name: name.substring(0, 80),
            price,
            shopCode: parsed.shopCode,
            itemId: parsed.itemId,
            url: parsed.originalUrl,
        };
    } catch {
        return {
            name: `${parsed.shopCode}/${parsed.itemId}`,
            price: 0,
            shopCode: parsed.shopCode,
            itemId: parsed.itemId,
            url: parsed.originalUrl,
        };
    }
}

// ========== レビュースクレイピング ==========
async function scrapeReviewsFromUrl(parsed, maxPages = 3) {
    const reviews = [];

    for (let page = 1; page <= maxPages; page++) {
        try {
            const url = `https://review.rakuten.co.jp/item/${parsed.shopCode}/${parsed.itemId}/?p=${page}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                },
            });

            if (!response.ok) break;
            const html = await response.text();
            const $ = cheerio.load(html);
            let found = false;

            // パターン1: 新しいレビュー構造
            $('div.review-item, div.revRvwUserSec, div[class*="review"]').each((_, el) => {
                const $el = $(el);
                const text = $el.find('.review-body, .revRvwUserEntryCmt, [class*="comment"], [class*="body"]').text().trim();
                const ratingText = $el.find('[class*="star"], [class*="rating"]').text();
                const ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
                const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
                const title = $el.find('.review-title, [class*="title"]').first().text().trim();

                if (text && text.length > 10) {
                    reviews.push({ text, rating: Math.min(rating, 5), title });
                    found = true;
                }
            });

            // パターン2
            if (!found) {
                $('div.revRvwUserSec, div.revRvw').each((_, el) => {
                    const $el = $(el);
                    const text = $el.find('.revRvwUserEntryCmt, .revRvwComment, td.revRvwCmnt').text().trim();
                    const ratingText = $el.find('.revUserRvwStar, .revRvwUserEntryRate, [class*="star"]').text();
                    const ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
                    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
                    if (text && text.length > 10) {
                        reviews.push({ text, rating: Math.min(rating, 5), title: '' });
                        found = true;
                    }
                });
            }

            if (!found) break;
            if (page < maxPages) await sleep(DELAY_MS);
        } catch (err) {
            console.error(`Scrape error page ${page}:`, err.message);
            break;
        }
    }

    return reviews;
}

// ========== デモデータ ==========
function getDemoParsedUrls() {
    return [
        { shopCode: 'demo-audio', itemId: 'earphone-pro', originalUrl: 'https://item.rakuten.co.jp/demo-audio/earphone-pro/' },
        { shopCode: 'demo-audio', itemId: 'earphone-lite', originalUrl: 'https://item.rakuten.co.jp/demo-audio/earphone-lite/' },
        { shopCode: 'demo-sound', itemId: 'wireless-buds', originalUrl: 'https://item.rakuten.co.jp/demo-sound/wireless-buds/' },
    ];
}

function getDemoProducts() {
    return [
        { name: '高品質ワイヤレスイヤホン Bluetooth 5.3 ノイズキャンセリング', price: 4980, shopCode: 'demo-audio', itemId: 'earphone-pro', url: '#' },
        { name: 'コンパクト完全ワイヤレスイヤホン 超軽量 防水IPX5', price: 3280, shopCode: 'demo-audio', itemId: 'earphone-lite', url: '#' },
        { name: 'スポーツ向けワイヤレスイヤホン 耳掛け式 Bluetooth5.2', price: 5500, shopCode: 'demo-sound', itemId: 'wireless-buds', url: '#' },
    ];
}

function getDemoReviewsForProduct(index) {
    const reviewSets = [
        // 商品A: 高品質ワイヤレスイヤホン
        [
            { text: '音質はとても良いです。低音がしっかり出ていてクリアなサウンドです。ノイズキャンセリングも電車内で効果を実感できました。ただ、バッテリーが2週間で持たなくなってきたのが残念です。', rating: 4, title: '音質は最高' },
            { text: 'この価格帯では考えられないほど音質が良いです。通話品質も問題なく、テレワークでも使えます。', rating: 5, title: 'コスパ最高' },
            { text: 'ノイズキャンセリングの効果が素晴らしい。電車の中でも集中できます。装着感も軽くて長時間つけても疲れません。', rating: 5, title: '通勤のお供に' },
            { text: 'タッチ操作の誤反応が多すぎます。音量を変えようとして曲が止まることがしょっちゅうあります。物理ボタンにしてほしいです。', rating: 2, title: '操作性が...' },
            { text: '左耳だけ接続が切れる現象が頻繁に発生します。音質は良いだけに残念。返品も検討しています。', rating: 1, title: '接続不安定' },
            { text: '充電ケースの蓋がすぐ壊れました。1ヶ月で留め具が緩くなって勝手に開きます。充電ケースの作りをもう少ししっかりしてほしい。', rating: 2, title: 'ケースが弱い' },
            { text: 'デザインがスタイリッシュで気に入っています。ケースもコンパクトで持ち運びしやすいです。', rating: 4, title: 'デザイン◎' },
            { text: '音質もデザインも満足していますが、バッテリーの持ちが悪すぎます。3時間くらいで切れるのは短すぎます。もう少しバッテリー持ちを改善してほしいです。', rating: 3, title: 'バッテリーが...' },
            { text: '耳が痛くなって30分以上つけられません。イヤーピースのサイズが自分には合わないようです。サイズ展開をもっと増やしてほしい。', rating: 2, title: 'フィット感' },
            { text: '防水機能がないので雨の日に使えません。防水機能があれば完璧なのに。', rating: 3, title: '防水がほしい' },
        ],
        // 商品B: コンパクト完全ワイヤレスイヤホン
        [
            { text: '軽くて長時間つけても疲れないのが最大のメリットです。通勤で毎日使っていますが快適です。', rating: 5, title: '軽くて快適' },
            { text: '音質はこの価格帯では十分良いレベルです。低音は控えめですが、クリアな中高音が気持ちいいです。', rating: 4, title: '音質OK' },
            { text: 'バッテリーが1ヶ月で劣化して、満充電でも2時間しか持たなくなりました。最初は5時間持ったのに。', rating: 1, title: 'バッテリー劣化' },
            { text: 'ペアリングが頻繁に切れるのがストレスです。スマホとの接続が毎朝やり直しになります。', rating: 2, title: '接続切れ' },
            { text: '価格が安いのにこの品質は素晴らしい。コスパ最高のイヤホンだと思います。', rating: 5, title: 'コスパ良し' },
            { text: '防水IPX5なので汗をかいても安心して使えます。ジムでのトレーニング中も問題ありません。', rating: 5, title: '防水最高' },
            { text: 'タッチ操作の反応が遅くて、何度もタップしないと反応しないことがあります。もう少しタッチの感度を上げてほしい。', rating: 3, title: 'タッチ反応' },
            { text: '充電ケースが安っぽい。プラスチックの質感が明らかにチープです。ケースのデザインをもう少し高級感のあるものにしてほしい。', rating: 3, title: 'ケースの質' },
        ],
        // 商品C: スポーツ向けワイヤレスイヤホン
        [
            { text: '耳掛け式なのでランニング中も絶対に外れません。フィット感が抜群で激しい運動でも安定しています。', rating: 5, title: 'スポーツに最適' },
            { text: '音質は普通レベルです。特に感動はないですが、スポーツ用としては十分です。', rating: 3, title: '音質は普通' },
            { text: 'バッテリーの持ちが悪い。カタログでは6時間と書いてあるのに、実際は3時間くらいで切れます。バッテリー表記を正確にしてほしい。', rating: 2, title: 'バッテリー表記' },
            { text: 'ノイズキャンセリングが弱くてほとんど効果がありません。外の音がスカスカ聞こえてきます。', rating: 2, title: 'NC弱い' },
            { text: '説明書が英語だけで日本語がありません。設定方法がわからず困りました。日本語の説明書を同梱してほしい。', rating: 2, title: '日本語説明書なし' },
            { text: 'マイクの音質が良くて、通話相手にクリアに聞こえると言われました。テレワークにも使えます。', rating: 4, title: '通話品質◎' },
            { text: '耳掛け部分が硬くて長時間つけていると耳の上が痛くなります。もう少し柔らかい素材にしてほしい。', rating: 3, title: '長時間は辛い' },
            { text: '値段の割に機能が少ない。この価格なら他にもっと良い選択肢があると思います。コスパは悪いです。', rating: 2, title: 'コスパ悪い' },
            { text: 'Bluetooth接続は安定していて途切れることはほとんどありません。接続の安定性は評価できます。', rating: 4, title: '接続安定' },
        ],
    ];

    return reviewSets[index] || reviewSets[0];
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('📊 レビュー分析ツール（文レベル構造化分析 + クロス商品サマリ）');
    console.log('   POST /api/parse-urls  — URL解析');
    console.log('   POST /api/analyze     — 一括分析（URL未入力でデモモード）');
    console.log('   GET  /api/product/:i/details — 個別商品詳細');
    console.log('   GET  /api/summary     — クロス商品サマリ');
});

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseMultipleUrls } from './lib/url-parser.js';
import { analyzeAllReviews } from './lib/sentence-analyzer.js';
import { generateCrossSummary } from './lib/cross-analyzer.js';
import { generateCSV, generatePrintableHTML } from './lib/report-generator.js';

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
                // parsed[i]にproducts[i]のreviewNumericIdをマージして渡す
                reviews = await scrapeReviewsFromUrl({ ...parsed[i], reviewNumericId: products[i].reviewNumericId }, 3);
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

// ========== CSVエクスポート ==========
app.get('/api/export/csv', (req, res) => {
    if (!analysisCache) {
        return res.status(404).json({ error: '先に分析を実行してください' });
    }
    const csv = generateCSV(analysisCache);
    const filename = `review-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
});

// ========== 印刷用HTMLレポート ==========
app.get('/api/export/report', (req, res) => {
    if (!analysisCache) {
        return res.status(404).json({ error: '先に分析を実行してください' });
    }
    const html = generatePrintableHTML(analysisCache);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

// ========== 分析結果の保存 ==========
const DATA_DIR = path.join(__dirname, 'data');
if (!process.env.VERCEL) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
}

app.post('/api/save', (req, res) => {
    try {
        if (!analysisCache) {
            return res.status(404).json({ error: '保存する分析結果がありません' });
        }
        const id = crypto.randomUUID().slice(0, 8);
        const title = req.body.title || `分析 ${new Date().toLocaleDateString('ja-JP')}`;
        const entry = {
            id,
            title,
            savedAt: new Date().toISOString(),
            category: analysisCache.summary.category,
            productCount: analysisCache.summary.productCount,
            totalReviews: analysisCache.summary.totalReviews,
            data: analysisCache,
        };
        try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
        fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(entry, null, 2), 'utf-8');
        res.json({ id, title, savedAt: entry.savedAt });
    } catch (err) {
        console.error('Save error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/history', (req, res) => {
    try {
        try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
        const items = files.map(f => {
            const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
            return {
                id: raw.id,
                title: raw.title,
                savedAt: raw.savedAt,
                category: raw.category,
                productCount: raw.productCount,
                totalReviews: raw.totalReviews,
            };
        }).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        res.json(items);
    } catch (err) {
        console.error('History error:', err.message);
        res.json([]);
    }
});

app.get('/api/history/:id', (req, res) => {
    try {
        const filePath = path.join(DATA_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '保存データが見つかりません' });
        }
        const entry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        analysisCache = entry.data;
        res.json(entry.data);
    } catch (err) {
        console.error('History load error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/history/:id', (req, res) => {
    try {
        const filePath = path.join(DATA_DIR, `${req.params.id}.json`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Delete error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== 商品情報取得 ==========
/**
 * HTMLレスポンスをEUC-JP/UTF-8に応じてデコードする
 */
async function fetchHtmlDecoded(url, headers) {
    const response = await fetch(url, { headers });
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    // Content-Typeヘッダーまたはデフォルトでエンコーディングを判定
    const contentType = response.headers.get('content-type') || '';
    const enc = /euc-jp/i.test(contentType) ? 'EUC-JP'
        : /shift.jis/i.test(contentType) ? 'Shift_JIS'
            : 'UTF-8';
    return iconv.decode(buffer, enc);
}

async function fetchProductInfo(parsed) {
    try {
        const url = `https://item.rakuten.co.jp/${parsed.shopCode}/${parsed.itemId}/`;
        const reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        };
        const html = await fetchHtmlDecoded(url, reqHeaders);
        const $ = cheerio.load(html);

        // 商品名
        const name = $('title').text().split('|')[0]?.trim() || $('h1').first().text().trim() || `${parsed.shopCode}/${parsed.itemId}`;

        // 価格: meta[itemprop="price"] から確実に取得
        const priceContent = $('meta[itemprop="price"]').attr('content');
        const price = priceContent ? parseInt(priceContent, 10) : 0;

        // カテゴリー: JSON-LD BreadcrumbListから取得（最も信頼性が高い）
        const categories = [];
        $('script[type="application/ld+json"]').each((_, el) => {
            if (categories.length > 0) return; // すでに取得済み
            try {
                const json = JSON.parse($(el).html());
                if (json['@type'] === 'BreadcrumbList' && Array.isArray(json.itemListElement)) {
                    for (const item of json.itemListElement) {
                        const catName = item.item?.name || item.name || '';
                        // 楽天市場トップ（1番目）は除外
                        if (catName && item.position > 1) {
                            categories.push(catName);
                        }
                    }
                }
            } catch { /* JSONパースエラーは無視 */ }
        });

        // レビューの数値ID: ページ内のreview.rakuten.co.jpリンクから取得
        let reviewNumericId = null;
        $('a[href*="review.rakuten.co.jp/item/"]').each((_, el) => {
            if (reviewNumericId) return;
            const href = $(el).attr('href') || '';
            const m = href.match(/\/item\/1\/(\d+)_(\d+)/);
            if (m) reviewNumericId = { shopNumId: m[1], itemNumId: m[2] };
        });
        if (!reviewNumericId) {
            const bodyHtml = $.html();
            const m = bodyHtml.match(/review\.rakuten\.co\.jp\/item\/1\/(\d+)_(\d+)/);
            if (m) reviewNumericId = { shopNumId: m[1], itemNumId: m[2] };
        }

        console.log(`✅ fetchProductInfo: ${name.substring(0, 40)} | price=${price} | cats=[${categories.join(', ')}] | reviewId=${JSON.stringify(reviewNumericId)}`);

        return {
            name: name.substring(0, 80),
            price,
            categories: categories.slice(0, 5),
            shopCode: parsed.shopCode,
            itemId: parsed.itemId,
            reviewNumericId,
            url: parsed.originalUrl,
        };
    } catch (err) {
        console.error('fetchProductInfo error:', err.message);
        return {
            name: `${parsed.shopCode}/${parsed.itemId}`,
            price: 0,
            categories: [],
            shopCode: parsed.shopCode,
            itemId: parsed.itemId,
            reviewNumericId: null,
            url: parsed.originalUrl,
        };
    }
}

// ========== レビュースクレイピング ==========
async function scrapeReviewsFromUrl(parsed, maxPages = 3) {
    const reviews = [];

    // 数値IDが取得済みかチェック（fetchProductInfoで設定される）
    const reviewNumericId = parsed.reviewNumericId || null;

    for (let page = 1; page <= maxPages; page++) {
        try {
            let url;
            if (reviewNumericId) {
                // 正しいURL形式: /item/1/{shopNumId}_{itemNumId}/{page}.1/
                url = `https://review.rakuten.co.jp/item/1/${reviewNumericId.shopNumId}_${reviewNumericId.itemNumId}/${page}.1/`;
            } else {
                // フォールバック（従来形式、動かない場合が多い）
                url = `https://review.rakuten.co.jp/item/${parsed.shopCode}/${parsed.itemId}/?p=${page}`;
            }

            console.log(`📝 Scraping reviews: ${url}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': 'https://review.rakuten.co.jp/',
                },
            });

            if (!response.ok) {
                console.log(`  → HTTP ${response.status}, stopping`);
                break;
            }
            const html = await response.text();
            const $ = cheerio.load(html);
            let found = false;

            // 現在の楽天レビューページ構造: CSS Modulesのハッシュクラスを使用
            // クラスプレフィックス: review-body, reviewer-info, rating, star-container
            $('[class*="review-body"]').each((_, el) => {
                const $el = $(el);
                const text = $el.text().trim();
                if (!text || text.length < 10) return;

                // 親または祖先要素から評価を取得
                let rating = 0;
                const $ancestor = $el.parents().filter((_, a) => {
                    return $(a).find('[class*="rating"]').length > 0 ||
                        $(a).find('[class*="star-container"]').length > 0;
                }).first();

                // 星の数を数える（filledな星アイコン）
                const starCount = $ancestor.find('[class*="rex-rating-filled"], [class*="star-filled"]').length;
                if (starCount > 0) {
                    rating = Math.min(starCount, 5);
                } else {
                    // テキストから評価数値を抽出
                    const ratingText = $ancestor.find('[class*="rating"]').first().text();
                    const m = ratingText.match(/^(\d)/);
                    if (m) rating = parseInt(m[1]);
                }

                // タイトルは兄弟または親内の別要素
                const title = $ancestor.find('[class*="title"]').first().text().trim() ||
                    $el.parent().find('[class*="title"]').first().text().trim();

                reviews.push({ text: text.replace(/さらに表示$/, '').trim(), rating: Math.min(rating, 5), title });
                found = true;
            });

            // フォールバック: 旧構造 (revRvw系クラス)
            if (!found) {
                $('div.revRvwUserSec, div.revRvw, td.revRvwCmnt').each((_, el) => {
                    const $el = $(el);
                    const text = ($el.is('td') ? $el : $el.find('.revRvwUserEntryCmt, .revRvwComment, td.revRvwCmnt')).text().trim();
                    const ratingText = $el.find('.revUserRvwStar, .revRvwUserEntryRate, [class*="star"]').text();
                    const ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
                    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
                    if (text && text.length > 10) {
                        reviews.push({ text, rating: Math.min(rating, 5), title: '' });
                        found = true;
                    }
                });
            }

            console.log(`  → Found ${reviews.length} reviews so far (page ${page})`);
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

// Vercel環境ではapp.listen不要（サーバーレス関数として動作）
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log('📊 レビュー分析ツール（文レベル構造化分析 + クロス商品サマリ）');
        console.log('   POST /api/parse-urls  — URL解析');
        console.log('   POST /api/analyze     — 一括分析（URL未入力でデモモード）');
        console.log('   GET  /api/product/:i/details — 個別商品詳細');
        console.log('   GET  /api/summary     — クロス商品サマリ');
    });
}

// Vercelサーバーレス関数用エクスポート
export default app;

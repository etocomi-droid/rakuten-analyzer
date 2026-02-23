import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const DELAY_MS = 1500; // リクエスト間隔（ミリ秒）

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 楽天レビューページからレビューをスクレイピング
 * @param {string} itemCode - 商品コード (例: "shopcode:itemid")
 * @param {number} maxPages - 取得する最大ページ数
 * @returns {Array} レビュー配列
 */
export async function scrapeReviews(itemCode, maxPages = 3) {
    const reviews = [];
    // itemCode format: "shopcode:itemid" -> review URL path
    const parts = itemCode.split(':');
    if (parts.length < 2) {
        console.warn(`Invalid itemCode format: ${itemCode}`);
        return reviews;
    }
    const shopCode = parts[0];
    const itemId = parts[1];

    for (let page = 1; page <= maxPages; page++) {
        try {
            const url = `https://review.rakuten.co.jp/item/${shopCode}/${itemId}/?l2-id=review_PC_il_body_05&p=${page}`;

            const res = await fetch(url, {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                },
            });

            if (!res.ok) {
                console.warn(`Review page ${page} returned ${res.status}`);
                break;
            }

            const html = await res.text();
            const $ = cheerio.load(html);

            // レビューコンテナを検索
            const reviewElements = $('div.review-item, div.revRvwUserSec, div[class*="review"]');

            if (reviewElements.length === 0 && page === 1) {
                // 代替セレクタを試行
                const altReviews = $('table.revTbl tr, div.revRvw, li.revRvwLst');
                if (altReviews.length === 0) {
                    console.warn('No review elements found with any selector');
                    break;
                }
            }

            let foundAny = false;

            // パターン1: 新しいレビューHTML構造
            $('div.review-item').each((_, el) => {
                const $el = $(el);
                const rating = parseRating($el.find('[class*="star"], [class*="rating"]').text());
                const text = $el.find('.review-body, .revRvwUserEntryCmt, [class*="comment"], [class*="body"]').text().trim();
                const title = $el.find('.review-title, [class*="title"]').first().text().trim();
                const date = $el.find('.review-date, [class*="date"]').first().text().trim();

                if (text) {
                    reviews.push({ rating, text, title, date });
                    foundAny = true;
                }
            });

            // パターン2: 旧レビューHTML構造  
            if (!foundAny) {
                $('div.revRvwUserSec, div.revRvw').each((_, el) => {
                    const $el = $(el);
                    const ratingText = $el.find('.revUserRvwStar, .revRvwUserEntryRate, [class*="star"]').text();
                    const rating = parseRating(ratingText);
                    const text = $el.find('.revRvwUserEntryCmt, .revRvwComment, td.revRvwCmnt').text().trim();
                    const title = $el.find('.revRvwUserEntryTtl, td.revRvwTtl').text().trim();
                    const date = $el.find('.revRvwUserEntryDate, td.revRvwDt').text().trim();

                    if (text) {
                        reviews.push({ rating, text, title, date });
                        foundAny = true;
                    }
                });
            }

            // パターン3: さらに汎用的なパース
            if (!foundAny) {
                // すべてのテキストブロックからレビューらしきものを抽出
                $('p, div').each((_, el) => {
                    const $el = $(el);
                    const text = $el.text().trim();
                    if (text.length > 30 && text.length < 2000 && !$el.children('p, div').length) {
                        // 長めのテキストブロック = レビュー候補
                        reviews.push({ rating: 0, text, title: '', date: '' });
                        foundAny = true;
                    }
                });
            }

            if (!foundAny) break;

            // レート制限
            if (page < maxPages) {
                await sleep(DELAY_MS);
            }
        } catch (err) {
            console.error(`Error scraping page ${page}:`, err.message);
            break;
        }
    }

    return reviews;
}

/**
 * 評価テキストから数値を抽出
 */
function parseRating(text) {
    if (!text) return 0;
    const match = text.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
}

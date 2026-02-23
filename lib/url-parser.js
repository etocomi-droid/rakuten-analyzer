/**
 * 楽天商品URL解析モジュール
 * URLからショップコード・商品コードを抽出し、レビューURLを生成
 */

/**
 * 楽天商品URLを解析
 * @param {string} url - 楽天商品URL
 * @returns {{ shopCode: string, itemId: string, reviewUrl: string } | null}
 */
export function parseRakutenUrl(url) {
    try {
        const parsed = new URL(url.trim());
        if (!parsed.hostname.includes('rakuten.co.jp')) return null;

        // https://item.rakuten.co.jp/{shopCode}/{itemId}/
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts.length < 2) return null;

        const shopCode = pathParts[0];
        const itemId = pathParts[1];

        return {
            shopCode,
            itemId,
            originalUrl: url.trim(),
            reviewUrl: `https://review.rakuten.co.jp/item/${shopCode}/${itemId}/`,
        };
    } catch {
        return null;
    }
}

/**
 * 複数URLを一括解析
 * @param {string} rawText - 改行区切りのURL群
 * @returns {Array} 解析結果の配列
 */
export function parseMultipleUrls(rawText) {
    const lines = rawText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    const results = [];

    for (const line of lines) {
        const parsed = parseRakutenUrl(line);
        if (parsed) {
            results.push(parsed);
        }
    }

    return results;
}

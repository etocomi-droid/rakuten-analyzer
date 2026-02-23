/**
 * クロス商品分析エンジン
 * 複数商品の分析結果を統合し、カテゴリ・価格帯における
 * 「評価を上げる要因」「評価を下げる要因」「差別化ヒント」を生成
 */

/**
 * カテゴリと価格帯を推定
 */
function estimateCategoryAndPriceRange(products) {
    const prices = products.map(p => p.price).filter(p => p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    // カテゴリ推定: 商品名の共通キーワードを探す
    const allNames = products.map(p => p.name || '');
    const commonWords = findCommonKeywords(allNames);

    return {
        category: commonWords.length > 0 ? commonWords.join(' ') : '不明',
        priceRange: { min: minPrice, max: maxPrice },
    };
}

/**
 * 商品名群から共通キーワードを抽出
 */
function findCommonKeywords(names) {
    if (names.length < 2) return names;

    // 各商品名をトークン化（カタカナ語、漢字語をざっくり分割）
    const tokenSets = names.map(name => {
        const tokens = new Set();
        // カタカナ連続
        const katakana = name.match(/[ァ-ヶー]+/g) || [];
        katakana.forEach(t => { if (t.length >= 2) tokens.add(t); });
        // 英数字連続
        const alpha = name.match(/[a-zA-Z0-9]+/g) || [];
        alpha.forEach(t => { if (t.length >= 2) tokens.add(t); });
        // 漢字連続
        const kanji = name.match(/[一-龥]+/g) || [];
        kanji.forEach(t => { if (t.length >= 2) tokens.add(t); });
        return tokens;
    });

    // 2商品以上に共通するトークンを抽出
    const allTokens = new Map();
    for (const ts of tokenSets) {
        for (const t of ts) {
            allTokens.set(t, (allTokens.get(t) || 0) + 1);
        }
    }

    const threshold = Math.max(2, Math.floor(names.length * 0.5));
    const common = [...allTokens.entries()]
        .filter(([, count]) => count >= threshold)
        .sort((a, b) => b[1] - a[1])
        .map(([token]) => token)
        .slice(0, 3);

    return common;
}

/**
 * 複数商品の分析結果からクロスサマリを生成
 * @param {Array} productAnalyses - [{productInfo, analysis}, ...]
 */
export function generateCrossSummary(productAnalyses) {
    const products = productAnalyses.map(pa => pa.productInfo);
    const { category, priceRange } = estimateCategoryAndPriceRange(products);

    const totalReviews = productAnalyses.reduce((sum, pa) => sum + pa.analysis.totalReviews, 0);

    // 全商品のポジティブ文を集約（高評価レビュー優先）
    const positiveFactors = aggregateFactors(productAnalyses, 'positive');

    // 全商品のネガティブ文を集約（低評価レビュー優先）
    const negativeFactors = aggregateFactors(productAnalyses, 'negative');

    // 改善要望を全商品分集約
    const allRequests = aggregateRequests(productAnalyses);

    // 差別化ヒント生成
    const differentiationHints = generateHints(negativeFactors, allRequests);

    // 商品間比較テーブル
    const comparisonTable = buildComparisonTable(productAnalyses);

    return {
        category,
        priceRange,
        productCount: products.length,
        totalReviews,
        positiveFactors: positiveFactors.slice(0, 8),
        negativeFactors: negativeFactors.slice(0, 8),
        differentiationHints: differentiationHints.slice(0, 5),
        improvementRequests: allRequests.slice(0, 8),
        comparisonTable,
    };
}

/**
 * 全商品のポジ/ネガ文を集約
 */
function aggregateFactors(productAnalyses, sentiment) {
    const factorMap = new Map(); // key = normalized sentence -> factor data

    for (let pIdx = 0; pIdx < productAnalyses.length; pIdx++) {
        const pa = productAnalyses[pIdx];
        const productName = pa.productInfo.name || `商品${pIdx + 1}`;

        // 高評価/低評価レビューの対応する感情の文を取得
        const sourceSentences = sentiment === 'positive'
            ? pa.analysis.topPositiveSentences
            : pa.analysis.topNegativeSentences;

        for (const item of sourceSentences) {
            const key = normalizeForGrouping(item.sentence);
            if (!factorMap.has(key)) {
                factorMap.set(key, {
                    sentence: item.sentence,
                    aspect: item.aspect,
                    totalCount: 0,
                    products: [],
                });
            }
            const factor = factorMap.get(key);
            factor.totalCount += item.count;
            if (!factor.products.includes(productName)) {
                factor.products.push(productName);
            }
        }
    }

    // ソート: 出現商品数 × 件数
    return [...factorMap.values()]
        .sort((a, b) => {
            const scoreA = a.products.length * 10 + a.totalCount;
            const scoreB = b.products.length * 10 + b.totalCount;
            return scoreB - scoreA;
        });
}

/**
 * 全商品の改善要望を集約
 */
function aggregateRequests(productAnalyses) {
    const reqMap = new Map();

    for (let pIdx = 0; pIdx < productAnalyses.length; pIdx++) {
        const pa = productAnalyses[pIdx];
        const productName = pa.productInfo.name || `商品${pIdx + 1}`;

        for (const req of pa.analysis.improvementRequests) {
            const key = normalizeForGrouping(req.sentence);
            if (!reqMap.has(key)) {
                reqMap.set(key, {
                    sentence: req.sentence,
                    aspect: req.aspect,
                    totalCount: 0,
                    products: [],
                });
            }
            const item = reqMap.get(key);
            item.totalCount += req.count;
            if (!item.products.includes(productName)) {
                item.products.push(productName);
            }
        }
    }

    return [...reqMap.values()].sort((a, b) => b.totalCount - a.totalCount);
}

/**
 * 差別化ヒントを生成
 */
function generateHints(negativeFactors, requests) {
    const hints = [];

    // ネガティブ要因から: 多くの商品に共通する課題
    for (const neg of negativeFactors.filter(f => f.products.length >= 2)) {
        // 対応する要望があるか探す
        const relatedReq = requests.find(r => r.aspect === neg.aspect);

        hints.push({
            hint: `${neg.aspect}の改善が差別化ポイント`,
            reason: `${neg.products.length}商品中${neg.products.length}商品で共通の不満。ここを解決すれば優位に立てる`,
            relatedNegative: neg.sentence,
            relatedRequest: relatedReq ? relatedReq.sentence : '',
            aspect: neg.aspect,
            impactScore: neg.products.length * 10 + neg.totalCount,
        });
    }

    // 要望から: 多くの商品で共通する改善要望
    for (const req of requests.filter(r => r.products.length >= 2)) {
        const alreadyExists = hints.some(h => h.aspect === req.aspect);
        if (!alreadyExists) {
            hints.push({
                hint: `「${req.sentence}」の声に応える`,
                reason: `${req.products.length}商品で共通の要望（計${req.totalCount}件）`,
                relatedNegative: '',
                relatedRequest: req.sentence,
                aspect: req.aspect,
                impactScore: req.products.length * 5 + req.totalCount,
            });
        }
    }

    return hints.sort((a, b) => b.impactScore - a.impactScore);
}

/**
 * 商品間比較テーブルを生成
 */
function buildComparisonTable(productAnalyses) {
    return productAnalyses.map((pa, idx) => {
        const aspects = {};

        for (const am of pa.analysis.aspectMatrix) {
            const total = am.positiveCount + am.negativeCount;
            if (total === 0) {
                aspects[am.aspect] = 'neutral';
            } else if (am.positiveCount > am.negativeCount * 1.5) {
                aspects[am.aspect] = 'positive';
            } else if (am.negativeCount > am.positiveCount * 1.5) {
                aspects[am.aspect] = 'negative';
            } else {
                aspects[am.aspect] = 'neutral';
            }
        }

        return {
            productName: pa.productInfo.name || `商品${idx + 1}`,
            price: pa.productInfo.price || 0,
            rating: pa.analysis.averageRating,
            reviewCount: pa.analysis.totalReviews,
            aspects,
        };
    });
}

/**
 * グルーピング用の文正規化
 */
function normalizeForGrouping(sentence) {
    return sentence
        .replace(/[。！？!?\s、,]/g, '')
        .replace(/です|ます|ました|でした|だった/g, '')
        .substring(0, 20);
}

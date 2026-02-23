/**
 * 日本語テキスト感情分析エンジン
 * キーワードベースのセンチメントスコアリング
 */

// ポジティブキーワード辞書（スコア付き）
const POSITIVE_WORDS = {
    // 品質・満足
    '素晴らしい': 3, 'すばらしい': 3, '最高': 3, '完璧': 3, '優秀': 3,
    '良い': 2, 'よい': 2, 'いい': 2, '良かった': 2, 'よかった': 2,
    '気に入': 2, '満足': 2, '大満足': 3, '嬉しい': 2, 'うれしい': 2,
    '快適': 2, '便利': 2, '重宝': 2, '使いやすい': 2,
    '美味しい': 2, 'おいしい': 2, '旨い': 2, 'うまい': 2,
    '丁寧': 2, '綺麗': 2, 'きれい': 2, 'キレイ': 2,
    'お得': 2, 'コスパ': 1, 'お値打ち': 2,
    '迅速': 2, '早い': 1, '速い': 1, 'スムーズ': 2,

    // 推薦
    'おすすめ': 2, 'オススメ': 2, 'お勧め': 2, 'リピート': 2, 'リピ': 1,
    'また買': 2, 'また購入': 2, 'また利用': 2,

    // 感情
    '感動': 3, '感激': 3, '感謝': 2, 'ありがとう': 1,
    '楽しい': 2, '楽しめ': 2, '幸せ': 2, '嬉し': 2,
    '安心': 2, '信頼': 2, '丈夫': 2, 'しっかり': 1,

    // デザイン・見た目
    'おしゃれ': 2, 'オシャレ': 2, 'かわいい': 2, 'カワイイ': 2,
    'かっこいい': 2, 'カッコイイ': 2, 'スタイリッシュ': 2,
    '高級感': 2, '上品': 2, '素敵': 2, 'ステキ': 2,

    // 機能
    '高性能': 2, '多機能': 2, '高品質': 2, '期待通り': 2,
    '期待以上': 3, '想像以上': 3, '思った以上': 2,
};

// ネガティブキーワード辞書（スコア付き）
const NEGATIVE_WORDS = {
    // 品質・不満
    '最悪': -3, 'ひどい': -3, '酷い': -3, '悪い': -2, 'ダメ': -2,
    '不良': -2, '不良品': -3, '壊れ': -2, '故障': -2, '破損': -2,
    '残念': -2, 'がっかり': -2, 'ガッカリ': -2, '期待外れ': -3,
    '不満': -2, '不便': -2, '使いづらい': -2, '使いにくい': -2,
    '微妙': -1, 'いまいち': -2, 'イマイチ': -2,
    'まずい': -2, '不味い': -2,

    // コスト
    '高い': -1, '割高': -2, 'コスパ悪': -2, '値段の割': -1,
    '安っぽい': -2, 'チープ': -2,

    // 配送・対応
    '遅い': -1, '遅すぎ': -2, '届かない': -2, '配送遅': -2,
    '対応が悪': -2, '不親切': -2, '雑': -1,

    // 品質問題
    '匂い': -1, '臭い': -2, 'くさい': -2,
    '汚れ': -1, '汚い': -2, 'シミ': -1, '傷': -1,
    '小さい': -1, '大きすぎ': -1, 'サイズが合': -1,
    '薄い': -1, 'ペラペラ': -2, 'すぐ壊れ': -3,

    // 感情
    '後悔': -2, '失敗': -2, '無駄': -2, '意味ない': -2, '意味がない': -2,
    '二度と': -3, '返品': -2, '返金': -2, '交換': -1,
};

// 否定語（直後のポジティブを反転）
const NEGATION_WORDS = ['ない', 'なかった', 'ません', 'ず', 'ぬ', 'ん', 'ではない', 'じゃない', 'しない'];

/**
 * テキストの感情分析を実行
 * @param {string} text - 分析対象テキスト
 * @returns {Object} 分析結果
 */
export function analyzeSentiment(text) {
    if (!text || text.trim().length === 0) {
        return { score: 0, label: 'neutral', positiveWords: [], negativeWords: [] };
    }

    let score = 0;
    const foundPositive = [];
    const foundNegative = [];

    // ポジティブワード検出
    for (const [word, wordScore] of Object.entries(POSITIVE_WORDS)) {
        const regex = new RegExp(word, 'g');
        const matches = text.match(regex);
        if (matches) {
            // 否定語チェック
            const negated = isNegated(text, word);
            if (negated) {
                score -= wordScore; // 否定されたポジティブ → ネガティブに
                foundNegative.push({ word: `${word}（否定）`, score: -wordScore });
            } else {
                score += wordScore * matches.length;
                foundPositive.push({ word, score: wordScore, count: matches.length });
            }
        }
    }

    // ネガティブワード検出
    for (const [word, wordScore] of Object.entries(NEGATIVE_WORDS)) {
        const regex = new RegExp(word, 'g');
        const matches = text.match(regex);
        if (matches) {
            score += wordScore * matches.length; // wordScoreは既に負の値
            foundNegative.push({ word, score: wordScore, count: matches.length });
        }
    }

    // ラベル判定
    let label;
    if (score >= 2) label = 'positive';
    else if (score <= -2) label = 'negative';
    else label = 'neutral';

    return {
        score,
        label,
        positiveWords: foundPositive,
        negativeWords: foundNegative,
    };
}

/**
 * 否定語が直前にあるか検出
 */
function isNegated(text, word) {
    const idx = text.indexOf(word);
    if (idx < 0) return false;

    // wordの直後10文字に否定語があるか
    const afterText = text.substring(idx + word.length, idx + word.length + 10);
    for (const neg of NEGATION_WORDS) {
        if (afterText.includes(neg)) return true;
    }

    // wordの直前10文字に「不」があるか
    const beforeText = text.substring(Math.max(0, idx - 5), idx);
    if (beforeText.includes('不') || beforeText.includes('非')) return true;

    return false;
}

/**
 * レビュー群のバッチ分析
 * @param {Array} reviews - レビュー配列 [{text, rating, ...}]
 * @returns {Object} 分析サマリー
 */
export function analyzeReviews(reviews) {
    if (!reviews || reviews.length === 0) {
        return {
            totalCount: 0,
            sentimentBreakdown: { positive: 0, negative: 0, neutral: 0 },
            sentimentRatio: { positive: 0, negative: 0, neutral: 0 },
            averageScore: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            topPositiveKeywords: [],
            topNegativeKeywords: [],
            reviews: [],
        };
    }

    const results = reviews.map((review) => {
        const sentiment = analyzeSentiment(review.text);
        return {
            ...review,
            sentiment,
        };
    });

    // センチメント分布
    const breakdown = { positive: 0, negative: 0, neutral: 0 };
    results.forEach((r) => breakdown[r.sentiment.label]++);

    const total = results.length;
    const ratio = {
        positive: Math.round((breakdown.positive / total) * 100),
        negative: Math.round((breakdown.negative / total) * 100),
        neutral: Math.round((breakdown.neutral / total) * 100),
    };

    // 評価分布
    const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    results.forEach((r) => {
        const rating = Math.round(r.rating);
        if (rating >= 1 && rating <= 5) ratingDist[rating]++;
    });

    // キーワード集計
    const posKeywordMap = {};
    const negKeywordMap = {};

    results.forEach((r) => {
        r.sentiment.positiveWords.forEach((pw) => {
            posKeywordMap[pw.word] = (posKeywordMap[pw.word] || 0) + (pw.count || 1);
        });
        r.sentiment.negativeWords.forEach((nw) => {
            negKeywordMap[nw.word] = (negKeywordMap[nw.word] || 0) + (nw.count || 1);
        });
    });

    const topPositive = Object.entries(posKeywordMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word, count]) => ({ word, count }));

    const topNegative = Object.entries(negKeywordMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word, count]) => ({ word, count }));

    // 平均スコア
    const avgScore = results.reduce((sum, r) => sum + r.sentiment.score, 0) / total;

    return {
        totalCount: total,
        sentimentBreakdown: breakdown,
        sentimentRatio: ratio,
        averageScore: Math.round(avgScore * 100) / 100,
        ratingDistribution: ratingDist,
        topPositiveKeywords: topPositive,
        topNegativeKeywords: topNegative,
        reviews: results,
    };
}

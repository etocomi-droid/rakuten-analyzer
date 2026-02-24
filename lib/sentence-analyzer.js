/**
 * 文レベル感情分析エンジン
 * レビューテキストを文に分割し、各文から「対象（何が）」「評価表現（どう）」「アスペクト」を構造化抽出
 */

// ===== アスペクト分類辞書 =====
const ASPECT_DICTIONARY = {
    '品質': ['品質', '作り', '仕上げ', '素材', '質感', '縫製', '精度', '質', '出来', 'クオリティ', '性能', '機能'],
    '耐久性': ['バッテリー', '充電', '寿命', '壊れ', '故障', '劣化', '耐久', '持ち', '電池', '断線', '剥がれ', '割れ', '破損', '摩耗'],
    '操作性': ['ボタン', '操作', 'タッチ', '反応', '設定', '接続', 'ペアリング', 'Bluetooth', '使い方', 'スイッチ', '切替', 'UI', 'アプリ', 'リモコン'],
    'デザイン': ['デザイン', '見た目', '色', 'サイズ', '形', '重さ', '大きさ', '小さ', '軽', '重', 'コンパクト', '薄', 'スタイリッシュ', 'おしゃれ', 'カラー'],
    '価格': ['価格', '値段', 'コスパ', 'コストパフォーマンス', '安い', '高い', '金額', '円', 'お買い得', 'お値打ち', '割安', '割高'],
    '音質': ['音質', '音', 'サウンド', '低音', '高音', '中音', 'ノイズ', 'クリア', '雑音', '音漏れ', 'ノイキャン', 'ノイズキャンセリング', 'マイク', '通話'],
    '装着感': ['フィット', '装着', '着け心地', '履き心地', '肌触り', 'つけ心地', '耳', '痛い', '痛く', 'フィット感', '着心地', '蒸れ', '締め付け'],
    '配送': ['配送', '梱包', '届', '発送', '包装', '到着', '遅い', '早い', '速い', '迅速', '丁寧'],
    'サポート': ['対応', 'サポート', '説明書', 'カスタマー', '保証', 'マニュアル', 'サービス', 'アフター', '返品', '交換', '問い合わせ'],
};

// ===== ポジティブ評価表現辞書 =====
const POSITIVE_EXPRESSIONS = [
    '良い', 'よい', 'いい', '良かった', 'よかった',
    '素晴らしい', 'すばらしい', '最高', '完璧', '優秀', '優れ',
    '満足', '気に入', '快適', '便利', '楽',
    'おすすめ', 'お勧め', 'オススメ',
    '使いやすい', '使い易い', 'わかりやすい', '分かりやすい',
    'しっかり', '丈夫', '頑丈', '安心', '安定',
    'コスパ最高', 'コスパが良', 'コスパ良', 'お買い得', 'お値打ち',
    '高性能', '多機能', '高品質',
    '期待通り', '期待以上', '想像以上', '思った以上',
    '綺麗', 'きれい', 'キレイ', '美しい',
    '軽い', '軽く', 'コンパクト',
    'クリア', '鮮明', '鮮やか',
    '静か', '静音',
    'フィット', 'ぴったり', 'ピッタリ',
    '迅速', '丁寧', '親切',
    '感動', '嬉しい', 'うれしい',
    '問題ない', '問題なく', '問題なし',
    '十分', '充分',
];

// ===== ネガティブ評価表現辞書 =====
const NEGATIVE_EXPRESSIONS = [
    '悪い', 'ダメ', 'だめ', 'イマイチ', 'いまいち', '微妙',
    '最悪', 'ひどい', '酷い',
    '不良', '不良品', '壊れ', '故障', '破損', '割れ',
    '使いにくい', '使い辛い', '使いづらい', 'わかりにくい', '分かりにくい',
    '不便', '面倒', '手間',
    '高い', '高すぎ', '割高',
    '安っぽい', 'チープ', 'ちゃち',
    '残念', 'がっかり', 'ガッカリ', '期待外れ', '期待はずれ',
    '重い', '重たい', 'でかい', 'デカい', '大きすぎ',
    'うるさい', 'やかましい',
    '痛い', '痛く',
    '不満', '不安',
    '遅い', '遅く', '時間がかかる',
    '切れ', '途切れ', '繋がら', 'つながら',
    '持たない', '持たなく', 'もたない',
    '合わない', '合わなかった',
    '返品', '返金', '交換',
    '二度と', '後悔',
    '誤反応', '誤作動', '反応しない', '反応が悪',
    'すぐ壊れ', 'すぐに壊れ',
    '足りない', '不足',
];

// ===== 否定語 =====
const NEGATION_WORDS = ['ない', 'なかった', 'ません', 'ず', 'ぬ', 'ではない', 'じゃない', 'しない', 'できない', 'なく', 'なさ'];

// ===== 改善要望パターン =====
const REQUEST_PATTERNS = [
    /してほしい/,
    /してほしかった/,
    /してくれたら/,
    /してくれれば/,
    /だったらよかった/,
    /だったら良かった/,
    /だったら良いのに/,
    /があれば/,
    /があったら/,
    /を改善/,
    /を改良/,
    /だと嬉しい/,
    /だとうれしい/,
    /だと助かる/,
    /にしてほしい/,
    /にしてくれれば/,
    /もう少し/,
    /もっと.{1,15}(ば|たら|ほしい|てほしい)/,
    /が足りない/,
    /が欲しい/,
    /がほしい/,
    /たらいいのに/,
    /ればいいのに/,
    /てくれると/,
    /だといい/,
];

/**
 * レビューテキストを意味のある文に分割
 */
export function splitIntoSentences(text) {
    if (!text || typeof text !== 'string') return [];

    // 改行で分割
    let chunks = text.split(/\n+/);

    // 各チャンクを句読点で分割
    const sentences = [];
    for (const chunk of chunks) {
        const parts = chunk.split(/([。！？!?]+)/);
        let current = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;
            if (/^[。！？!?]+$/.test(part)) {
                current += part;
                if (current.trim().length > 5) {
                    sentences.push(current.trim());
                }
                current = '';
            } else {
                if (current.trim().length > 5) {
                    sentences.push(current.trim());
                }
                current = part;
            }
        }
        if (current.trim().length > 5) {
            sentences.push(current.trim());
        }
    }

    // 接続助詞「が」「けど」「ものの」で分割(文が長い場合)
    const refined = [];
    for (const s of sentences) {
        if (s.length > 30) {
            const subParts = s.split(/(ですが、|ますが、|だが、|だけど、|けど、|けれど、|ものの、|のに、)/);
            let buf = '';
            for (let i = 0; i < subParts.length; i++) {
                const p = subParts[i];
                if (/^(ですが、|ますが、|だが、|だけど、|けど、|けれど、|ものの、|のに、)$/.test(p)) {
                    buf += p;
                    if (buf.trim().length > 5) refined.push(buf.trim());
                    buf = '';
                } else {
                    buf += p;
                }
            }
            if (buf.trim().length > 5) refined.push(buf.trim());
        } else {
            refined.push(s);
        }
    }

    return refined;
}

/**
 * 文からアスペクト（観点）を推定
 */
export function classifyAspect(sentence) {
    const lower = sentence.toLowerCase();
    let bestAspect = 'その他';
    let bestScore = 0;

    for (const [aspect, keywords] of Object.entries(ASPECT_DICTIONARY)) {
        let score = 0;
        for (const kw of keywords) {
            if (lower.includes(kw.toLowerCase())) {
                score += kw.length; // 長いキーワードほど高スコア
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestAspect = aspect;
        }
    }

    return bestAspect;
}

/**
 * 文から対象名詞（何が）を抽出
 * 簡易的にアスペクト辞書のキーワードマッチで対象を特定
 */
export function extractSubject(sentence) {
    for (const [, keywords] of Object.entries(ASPECT_DICTIONARY)) {
        for (const kw of keywords) {
            if (sentence.includes(kw) && kw.length >= 2) {
                return kw;
            }
        }
    }
    // フォールバック: 最初の名詞的な部分
    const match = sentence.match(/^(.{2,8}?)[がはもをの]/);
    return match ? match[1] : '';
}

/**
 * 文の感情判定
 */
export function judgeSentiment(sentence) {
    let positiveScore = 0;
    let negativeScore = 0;
    const matchedPositive = [];
    const matchedNegative = [];

    // ポジティブ表現チェック
    for (const expr of POSITIVE_EXPRESSIONS) {
        if (sentence.includes(expr)) {
            // 否定語チェック
            const isNegated = NEGATION_WORDS.some(neg => {
                const idx = sentence.indexOf(expr);
                const after = sentence.substring(idx + expr.length, idx + expr.length + 5);
                const before = sentence.substring(Math.max(0, idx - 3), idx);
                return after.includes(neg) || before.includes(neg);
            });

            if (isNegated) {
                negativeScore += 2;
                matchedNegative.push(expr + '(否定)');
            } else {
                positiveScore += 2;
                matchedPositive.push(expr);
            }
        }
    }

    // ネガティブ表現チェック
    for (const expr of NEGATIVE_EXPRESSIONS) {
        if (sentence.includes(expr)) {
            negativeScore += 2;
            matchedNegative.push(expr);
        }
    }

    let sentiment = 'neutral';
    if (positiveScore > negativeScore) sentiment = 'positive';
    else if (negativeScore > positiveScore) sentiment = 'negative';

    return {
        sentiment,
        positiveScore,
        negativeScore,
        matchedPositive,
        matchedNegative,
    };
}

/**
 * 改善要望かどうかチェック
 */
export function isImprovementRequest(sentence) {
    return REQUEST_PATTERNS.some(pattern => pattern.test(sentence));
}

/**
 * 1件のレビューを文レベルで分析
 */
export function analyzeReviewSentences(review, reviewIndex) {
    const sentences = splitIntoSentences(review.text);
    const results = [];

    for (const sentence of sentences) {
        const aspect = classifyAspect(sentence);
        const subject = extractSubject(sentence);
        const sentimentResult = judgeSentiment(sentence);
        const isRequest = isImprovementRequest(sentence);

        results.push({
            originalSentence: sentence,
            subject,
            aspect,
            sentiment: sentimentResult.sentiment,
            positiveScore: sentimentResult.positiveScore,
            negativeScore: sentimentResult.negativeScore,
            matchedPositive: sentimentResult.matchedPositive,
            matchedNegative: sentimentResult.matchedNegative,
            isRequest,
            sourceReview: {
                reviewIndex,
                rating: review.rating,
                fullText: review.text,
                title: review.title || '',
            },
        });
    }

    return results;
}

/**
 * 複数レビューを一括で文レベル分析
 */
export function analyzeAllReviews(reviews) {
    const allSentences = [];

    for (let i = 0; i < reviews.length; i++) {
        const results = analyzeReviewSentences(reviews[i], i);
        allSentences.push(...results);
    }

    // アスペクト別マトリクス生成
    const aspectMatrix = buildAspectMatrix(allSentences);

    // ネガティブ文ランキング
    const topNegative = buildSentenceRanking(allSentences, 'negative');

    // ポジティブ文ランキング
    const topPositive = buildSentenceRanking(allSentences, 'positive');

    // 改善要望抽出
    const requests = allSentences
        .filter(s => s.isRequest)
        .map(s => ({
            sentence: s.originalSentence,
            aspect: s.aspect,
            subject: s.subject,
        }));
    const groupedRequests = groupSimilarSentences(requests);

    // センチメント全体比率
    const sentimentBreakdown = {
        positive: allSentences.filter(s => s.sentiment === 'positive').length,
        neutral: allSentences.filter(s => s.sentiment === 'neutral').length,
        negative: allSentences.filter(s => s.sentiment === 'negative').length,
    };

    // 評価分布
    const ratingDistribution = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    for (const review of reviews) {
        const r = Math.round(review.rating);
        if (r >= 1 && r <= 5) ratingDistribution[String(r)]++;
    }

    return {
        totalReviews: reviews.length,
        totalSentences: allSentences.length,
        averageRating: reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 0,
        sentimentBreakdown,
        ratingDistribution,
        aspectMatrix,
        topNegativeSentences: topNegative,
        topPositiveSentences: topPositive,
        improvementRequests: groupedRequests,
        allAnalyzedSentences: allSentences,
    };
}

/**
 * アスペクト別評価マトリクスを生成
 */
function buildAspectMatrix(sentences) {
    const matrix = {};

    for (const s of sentences) {
        if (s.aspect === 'その他' && !s.subject) continue;

        if (!matrix[s.aspect]) {
            matrix[s.aspect] = { positive: [], negative: [], neutral: [] };
        }
        matrix[s.aspect][s.sentiment].push(s.originalSentence);
    }

    // 各アスペクトの代表文を選出
    return Object.entries(matrix)
        .map(([aspect, data]) => ({
            aspect,
            positiveCount: data.positive.length,
            negativeCount: data.negative.length,
            neutralCount: data.neutral.length,
            positiveSentences: groupSimilarSentences(
                data.positive.map(s => ({ sentence: s, aspect }))
            ).slice(0, 5),
            negativeSentences: groupSimilarSentences(
                data.negative.map(s => ({ sentence: s, aspect }))
            ).slice(0, 5),
        }))
        .filter(a => a.positiveCount + a.negativeCount > 0)
        .sort((a, b) => (b.positiveCount + b.negativeCount) - (a.positiveCount + a.negativeCount));
}

/**
 * 特定の感情の文をランキング化
 */
function buildSentenceRanking(sentences, sentiment) {
    const filtered = sentences.filter(s => s.sentiment === sentiment);
    const items = filtered.map(s => ({
        sentence: s.originalSentence,
        aspect: s.aspect,
        subject: s.subject,
    }));
    return groupSimilarSentences(items).slice(0, 10);
}

/**
 * 文の正規化（グルーピング用）
 * 助詞・語尾・句読点を除去して本質的な意味部分のみを残す
 */
function normalizeSentence(sentence) {
    return sentence
        .replace(/[。！？!?\s、,・「」『』（）()【】\[\]]/g, '')
        .replace(/です|ます|ました|でした|だった|ている|ていた|ております|しています|されています/g, '')
        .replace(/ですが|ますが|けど|けれど|ものの/g, '')
        .replace(/^(また|そして|しかし|ただ|でも|ですので|なので|それに|さらに)/g, '');
}

/**
 * 文からキーワード（アスペクト辞書ヒット語）を抽出
 */
function extractKeywords(sentence) {
    const keywords = [];
    for (const [, kws] of Object.entries(ASPECT_DICTIONARY)) {
        for (const kw of kws) {
            if (sentence.includes(kw) && kw.length >= 2) {
                keywords.push(kw);
            }
        }
    }
    // ポジ/ネガ表現も抽出
    for (const expr of POSITIVE_EXPRESSIONS) {
        if (sentence.includes(expr) && expr.length >= 2) keywords.push(expr);
    }
    for (const expr of NEGATIVE_EXPRESSIONS) {
        if (sentence.includes(expr) && expr.length >= 2) keywords.push(expr);
    }
    return [...new Set(keywords)];
}

/**
 * キーワード重複率を計算
 */
function calcKeywordOverlap(kwsA, kwsB) {
    if (kwsA.length === 0 && kwsB.length === 0) return 0;
    if (kwsA.length === 0 || kwsB.length === 0) return 0;
    const setA = new Set(kwsA);
    let overlap = 0;
    for (const kw of kwsB) {
        if (setA.has(kw)) overlap++;
    }
    return (2 * overlap) / (kwsA.length + kwsB.length);
}

/**
 * 類似文をグルーピングして件数集約
 * 3段階マッチング: 完全包含 → キーワード一致+中類似度 → 汎用bigram
 * アスペクト一致の文同士を優先的にグルーピング
 */
function groupSimilarSentences(items) {
    const groups = [];

    for (const item of items) {
        const normalized = normalizeSentence(item.sentence);
        const keywords = extractKeywords(item.sentence);
        let foundGroup = false;

        // スコアが高い順にベストなグループを選択
        let bestGroup = null;
        let bestScore = 0;

        for (const group of groups) {
            const gNorm = group.normalizedKey;
            const shorter = normalized.length < gNorm.length ? normalized : gNorm;
            const longer = normalized.length < gNorm.length ? gNorm : normalized;

            // アスペクト一致ボーナス
            const aspectBonus = (item.aspect && item.aspect === group.aspect) ? 0.15 : 0;

            // Stage 1: 完全包含（短い方が長い方に含まれる）
            if (shorter.length >= 5 && longer.includes(shorter)) {
                const score = 0.9 + aspectBonus;
                if (score > bestScore) { bestScore = score; bestGroup = group; }
                continue;
            }

            // Stage 2: キーワード一致 + bigram類似度（緩い閾値）
            const kwOverlap = calcKeywordOverlap(keywords, group.keywords);
            if (kwOverlap >= 0.5) {
                const bigramSim = calcSimilarity(normalized, gNorm);
                if (bigramSim >= 0.35) {
                    const score = (kwOverlap * 0.4 + bigramSim * 0.4) + aspectBonus;
                    if (score > bestScore) { bestScore = score; bestGroup = group; }
                    continue;
                }
            }

            // Stage 3: 汎用bigram類似度（厳しめの閾値）
            const sim = calcSimilarity(normalized, gNorm);
            const threshold = item.aspect === group.aspect ? 0.5 : 0.6;
            if (sim >= threshold) {
                const score = sim * 0.7 + aspectBonus;
                if (score > bestScore) { bestScore = score; bestGroup = group; }
            }
        }

        if (bestGroup && bestScore >= 0.4) {
            bestGroup.count++;
            // より短い文を代表文として採用（簡潔な方がわかりやすい）
            if (item.sentence.length < bestGroup.sentence.length && item.sentence.length > 10) {
                bestGroup.sentence = item.sentence;
            }
            foundGroup = true;
        }

        if (!foundGroup) {
            groups.push({
                sentence: item.sentence,
                aspect: item.aspect,
                subject: item.subject || '',
                count: 1,
                normalizedKey: normalized,
                keywords,
            });
        }
    }

    // 内部用プロパティを除去してソート
    return groups
        .map(({ normalizedKey, keywords, ...rest }) => rest)
        .sort((a, b) => b.count - a.count);
}

/**
 * bigram類似度計算
 */
function calcSimilarity(a, b) {
    if (!a || !b || a.length < 2 || b.length < 2) return 0;
    const bigramsA = new Set();
    const bigramsB = new Set();
    for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));
    for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.substring(i, i + 2));

    let intersection = 0;
    for (const bg of bigramsA) {
        if (bigramsB.has(bg)) intersection++;
    }

    return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

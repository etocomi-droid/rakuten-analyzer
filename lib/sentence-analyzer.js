/**
 * 文レベル感情分析エンジン
 * レビューテキストを文に分割し、各文から「対象（何が）」「評価表現（どう）」「アスペクト」を構造化抽出
 */

// ===== アスペクト分類辞書 =====
const ASPECT_DICTIONARY = {
    '品質': ['品質', '作り', '仕上げ', '素材', '質感', '縫製', '精度', '質', '出来', 'クオリティ', '性能', '機能', '密閉性', '強度', '安定性', '耐久性', '塗装'],
    '耐久性': ['バッテリー', '充電', '寿命', '壊れ', '故障', '劣化', '耐久', '持ち', '電池', '断線', '剥がれ', '割れ', '破損', '摩耗'],
    '操作性': ['ボタン', '操作', 'タッチ', '反応', '設定', '接続', 'ペアリング', 'Bluetooth', '使い方', 'スイッチ', '切替', 'UI', 'アプリ', 'リモコン'],
    'デザイン': ['デザイン', '見た目', '色', 'サイズ', '形', '重さ', '大きさ', '小さ', '軽', '重', 'コンパクト', '薄', 'スタイリッシュ', 'おしゃれ', 'カラー'],
    '価格': ['価格', '値段', 'コスパ', 'コストパフォーマンス', '安い', '高い', '金額', '円', 'お買い得', 'お値打ち', '割安', '割高', '費用対効果', '送料', '手数料', '交換送料', '割高感', '追加費用', '値付け'],
    '音質': ['音質', '音', 'サウンド', '低音', '高音', '中音', 'ノイズ', 'クリア', '雑音', '音漏れ', 'ノイキャン', 'ノイズキャンセリング', 'マイク', '通話'],
    '装着感': ['フィット', '装着', '着け心地', '履き心地', '肌触り', 'つけ心地', '耳', '痛い', '痛く', 'フィット感', '着心地', '蒸れ', '締め付け'],
    '配送': ['配送', '梱包', '届', '発送', '包装', '到着', '遅い', '早い', '速い', '迅速', '丁寧'],
    'サポート': ['対応', 'サポート', '説明書', 'カスタマー', '保証', 'マニュアル', 'サービス', 'アフター', '返品', '交換', '問い合わせ', '連絡速度', '案内', '初期不良対応', '返金案内', '交換対応', '対応品質', '保証対応', '問い合わせ対応'],
    // スプレッドシート由来の追加カテゴリ
    '期待差': ['期待していたほどではない', 'イメージと違った', '写真と実物の印象が違う', '説明と違う気がする', '思っていたのと違う', '期待していたより'],
    'サイズ・見た目': ['サイズ感', '色味', '長さ', '幅', '厚み', '重量感', '形状', '質感が'],
    '表示・説明': ['日本語説明', 'サイズ表記', 'ラベル', '注意書き', '成分表示', '画像説明', '保証案内', '仕様表記', '商品ページ'],
    '配送・梱包': ['緩衝材', '外箱', '封入物', '発送連絡', '納期', '在庫管理', '欠品対応', '箱の状態'],
    '使い勝手': ['操作性', '組み立て', '取り付け', '洗いやすさ', '手入れ', '携帯性', '収納性', '持ちやすさ'],
    '性能': ['切れ味', '吸引力', '風量', '電池持ち', 'パワー', '粘着力', '保温性', '冷却力', '発色', '防水性'],
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

// ===== スプレッドシート由来の改善要望キーワード（1000件対応）=====
const IMPROVEMENT_KEYWORDS = [
    // 期待差・品質
    '期待していたほどではなかった', '思っていたのと違った', '写真と実物の印象が違う', '説明と違う気がする',
    '表記がわかりにくい', '仕様が紛らわしい', '作りが雑', '縫製が甘い', 'ほつれがあった',
    '初期不良だった', '動作が不安定', 'すぐ壊れた', '耐久性が不安', '使ってすぐ劣化した',
    // 説明・表示
    '説明書がわかりにくい', '説明書が入っていない', '日本語説明がない', '組み立てが難しい',
    '取り付けがしにくい', '操作が直感的じゃない', '使い方が分かりづらい',
    // 感触・使い心地
    'ボタンが押しにくい', '反応が遅い', '音が大きい', '想像以上にうるさい', '匂いが気になる',
    '独特の臭いがする', '肌に合わなかった', '刺激を感じた', 'かゆくなった', '痛くなった',
    '期待した効果がない', '効果を感じにくい', '変化がわからない', '効果が続かない',
    // 性能
    'パワー不足', '吸引力が弱い', '風量が足りない', '充電がもたない', '電池の減りが早い',
    'バッテリーが弱い', '発熱が気になる', '熱くなりすぎる', '密閉性が弱い', '蓋が閉まりにくい',
    '開けにくい', '取っ手が持ちにくい', '滑りやすい',
    // サイズ・見た目
    'サイズ感が合わない', '色味が違って見える', '質感がイメージと違う', '素材がチープに感じる',
    'もっと厚みが欲しい', '薄すぎる', '破れやすい', '毛羽立つ', '色落ちする', '変色した',
    'にじむ', '端が剥がれる', '粘着が弱い', '粘着が強すぎる',
    // メンテナンス
    '手入れが面倒', '汚れが落ちにくい', '乾きにくい', '仕上がりにムラがある',
    '洗いにくい', '収納しづらい', 'かさばる',
    // 装着感
    'フィットしない', '着け心地が悪い', '蒸れる', '硬すぎる', '柔らかすぎる',
    // 価格・コスパ
    'コスパが良くない', '価格に見合わない', '送料が高い',
    // 配送・梱包
    '梱包が雑', '梱包が過剰', '箱が潰れていた', '到着が遅い', '欠品があった',
    // サポート
    'サポート対応が不親切に感じた', '問い合わせの返答が遅い', '交換案内が分かりづらい',
    // スプレッドシート追加パターン（文末表現）
    '価格帯を考えると物足りない', '改善の余地がある', '不満が残った', '期待ほど満足できなかった',
    '見直したほうが良いと思う', '次回は改良してほしい', '次回モデルで改善してほしい',
    '改善されるともっと使いやすい', '改良版に期待したい', '今後の改良に期待したい',
    'ネックで満足度が下がった', '説明を充実してほしい', '仕様を明確にしてほしい',
    '品質管理を強化してほしい', '検品を徹底してほしい', 'サポート体制を見直してほしい',
    '梱包を改善してほしい', '使い始めの印象が良くない', 'リピートしづらい',
    '人には勧めにくい', '残念に感じる', 'ストレスを感じる', '手間が増える',
    '期待値に届かない', '満足感が下がる', '毎回気を遣う',
];

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
    // スプレッドシート由来の追加パターン
    /改善の余地がある/,
    /物足りない/,
    /不満が残った/,
    /期待ほど満足できなかった/,
    /見直したほうが良い/,
    /次回は改良/,
    /次回モデルで改善/,
    /改善されるともっと/,
    /改良版に期待/,
    /今後の改良に期待/,
    /ネックで満足度が下がった/,
    /に期待したい/,
    /を見直してほしい/,
    /を改善してほしい/,
    /を充実してほしい/,
    /使い始めの印象が良くない/,
    /満足度が下がった/,
    /期待値に届かない/,
    /満足感が下がる/,
    /リピートしづらい/,
    /人には勧めにくい/,
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
 * 改善要望かどうかチェック（パターン＋スプレッドシートキーワード1000件対応）
 */
export function isImprovementRequest(sentence) {
    if (REQUEST_PATTERNS.some(pattern => pattern.test(sentence))) return true;
    return IMPROVEMENT_KEYWORDS.some(kw => sentence.includes(kw));
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

/**
 * レポート生成モジュール
 * CSV出力と印刷用HTML生成
 */

/**
 * BOM付きUTF-8 CSVを生成
 */
export function generateCSV(cache) {
    if (!cache) return '';

    const { products, analyses, summary } = cache;
    const rows = [];
    const sep = ',';

    // ===== セクション1: サマリ =====
    rows.push('=== クロス商品サマリ ===');
    rows.push(`カテゴリ${sep}${csvEsc(summary.category)}`);
    rows.push(`価格帯${sep}¥${summary.priceRange.min.toLocaleString()}〜¥${summary.priceRange.max.toLocaleString()}`);
    rows.push(`分析商品数${sep}${summary.productCount}`);
    rows.push(`総レビュー数${sep}${summary.totalReviews}`);
    rows.push('');

    // ===== セクション2: 評価を上げる要因 =====
    rows.push('=== 評価が上がる要因 ===');
    rows.push(`順位${sep}要因${sep}アスペクト${sep}件数${sep}商品数${sep}対象商品`);
    summary.positiveFactors.forEach((f, i) => {
        rows.push(`${i + 1}${sep}${csvEsc(f.sentence)}${sep}${csvEsc(f.aspect)}${sep}${f.totalCount}${sep}${f.products.length}${sep}${csvEsc(f.products.join(' / '))}`);
    });
    rows.push('');

    // ===== セクション3: 評価を下げる要因 =====
    rows.push('=== 評価が下がる要因 ===');
    rows.push(`順位${sep}要因${sep}アスペクト${sep}件数${sep}商品数${sep}対象商品`);
    summary.negativeFactors.forEach((f, i) => {
        rows.push(`${i + 1}${sep}${csvEsc(f.sentence)}${sep}${csvEsc(f.aspect)}${sep}${f.totalCount}${sep}${f.products.length}${sep}${csvEsc(f.products.join(' / '))}`);
    });
    rows.push('');

    // ===== セクション4: 差別化ヒント =====
    rows.push('=== 差別化のヒント ===');
    rows.push(`ヒント${sep}理由${sep}関連する不満${sep}関連する要望`);
    summary.differentiationHints.forEach(h => {
        rows.push(`${csvEsc(h.hint)}${sep}${csvEsc(h.reason)}${sep}${csvEsc(h.relatedNegative)}${sep}${csvEsc(h.relatedRequest)}`);
    });
    rows.push('');

    // ===== セクション5: 商品間比較 =====
    rows.push('=== 商品間比較 ===');
    const allAspects = new Set();
    summary.comparisonTable.forEach(p => Object.keys(p.aspects).forEach(a => allAspects.add(a)));
    const aspects = [...allAspects];

    rows.push(`項目${sep}${summary.comparisonTable.map(p => csvEsc(p.productName)).join(sep)}`);
    rows.push(`価格${sep}${summary.comparisonTable.map(p => `¥${p.price.toLocaleString()}`).join(sep)}`);
    rows.push(`評価${sep}${summary.comparisonTable.map(p => p.rating).join(sep)}`);
    rows.push(`レビュー数${sep}${summary.comparisonTable.map(p => p.reviewCount).join(sep)}`);
    const sentimentLabel = { positive: '😊良い', negative: '😠悪い', neutral: '😐普通' };
    aspects.forEach(aspect => {
        rows.push(`${csvEsc(aspect)}${sep}${summary.comparisonTable.map(p => sentimentLabel[p.aspects[aspect] || 'neutral']).join(sep)}`);
    });
    rows.push('');

    // ===== セクション6: 個別商品詳細 =====
    for (let i = 0; i < analyses.length; i++) {
        const pa = analyses[i];
        const name = pa.productInfo.name || `商品${i + 1}`;
        rows.push(`=== 個別分析: ${csvEsc(name)} ===`);
        rows.push(`レビュー数${sep}${pa.analysis.totalReviews}`);
        rows.push(`平均評価${sep}${pa.analysis.averageRating}`);
        rows.push(`ポジティブ文${sep}${pa.analysis.sentimentBreakdown.positive}`);
        rows.push(`ネガティブ文${sep}${pa.analysis.sentimentBreakdown.negative}`);
        rows.push(`ニュートラル文${sep}${pa.analysis.sentimentBreakdown.neutral}`);
        rows.push('');

        rows.push('アスペクト別評価:');
        rows.push(`アスペクト${sep}ポジティブ${sep}ネガティブ`);
        pa.analysis.aspectMatrix.forEach(a => {
            rows.push(`${csvEsc(a.aspect)}${sep}${a.positiveCount}${sep}${a.negativeCount}`);
        });
        rows.push('');

        rows.push('ネガティブランキング:');
        pa.analysis.topNegativeSentences.slice(0, 5).forEach((s, j) => {
            rows.push(`${j + 1}${sep}${csvEsc(s.sentence)}${sep}${csvEsc(s.aspect)}${sep}${s.count}件`);
        });
        rows.push('');

        rows.push('ポジティブランキング:');
        pa.analysis.topPositiveSentences.slice(0, 5).forEach((s, j) => {
            rows.push(`${j + 1}${sep}${csvEsc(s.sentence)}${sep}${csvEsc(s.aspect)}${sep}${s.count}件`);
        });
        rows.push('');
    }

    // BOM付きUTF-8
    return '\uFEFF' + rows.join('\r\n');
}

/**
 * 印刷用HTMLレポートを生成
 */
export function generatePrintableHTML(cache) {
    if (!cache) return '<html><body><p>分析データがありません</p></body></html>';

    const { summary, analyses } = cache;
    const sentimentEmoji = { positive: '😊', negative: '😠', neutral: '😐' };

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>商品レビュー分析レポート</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans JP', sans-serif; color: #1e293b; padding: 24px; font-size: 11pt; line-height: 1.6; }
    h1 { font-size: 18pt; text-align: center; margin-bottom: 4px; }
    .subtitle { text-align: center; color: #64748b; font-size: 10pt; margin-bottom: 16px; }
    .meta { text-align: center; margin-bottom: 20px; }
    .meta span { display: inline-block; padding: 2px 10px; margin: 2px; font-size: 9pt; border: 1px solid #cbd5e1; border-radius: 12px; }
    h2 { font-size: 13pt; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #6366f1; color: #4338ca; }
    h3 { font-size: 11pt; margin: 12px 0 6px; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 9pt; }
    th { background: #f1f5f9; padding: 6px 8px; text-align: left; border: 1px solid #e2e8f0; font-weight: 600; }
    td { padding: 6px 8px; border: 1px solid #e2e8f0; }
    .factor { padding: 6px 10px; margin: 4px 0; border-left: 3px solid; border-radius: 4px; font-size: 9.5pt; }
    .factor-pos { border-color: #22c55e; background: #f0fdf4; }
    .factor-neg { border-color: #ef4444; background: #fef2f2; }
    .hint { padding: 8px 10px; margin: 4px 0; background: #f5f3ff; border-left: 3px solid #8b5cf6; border-radius: 4px; font-size: 9.5pt; }
    .page-break { page-break-before: always; }
    @media print { body { padding: 0; } }
</style>
</head>
<body>
    <h1>📊 商品レビュー分析レポート</h1>
    <p class="subtitle">生成日時: ${new Date().toLocaleString('ja-JP')}</p>
    <div class="meta">
        <span>カテゴリ: ${esc(summary.category)}</span>
        <span>価格帯: ¥${summary.priceRange.min.toLocaleString()}〜¥${summary.priceRange.max.toLocaleString()}</span>
        <span>${summary.productCount}商品 / ${summary.totalReviews}件</span>
    </div>

    <h2>🟢 評価が上がる要因</h2>
    ${summary.positiveFactors.map((f, i) => `
        <div class="factor factor-pos">
            ${i + 1}. 「${esc(f.sentence)}」
            <small>[${esc(f.aspect)}] ${f.totalCount}件 / ${f.products.length}商品</small>
        </div>
    `).join('')}

    <h2>🔴 評価が下がる要因</h2>
    ${summary.negativeFactors.map((f, i) => `
        <div class="factor factor-neg">
            ${i + 1}. 「${esc(f.sentence)}」
            <small>[${esc(f.aspect)}] ${f.totalCount}件 / ${f.products.length}商品</small>
        </div>
    `).join('')}

    <h2>💡 差別化のヒント</h2>
    ${summary.differentiationHints.map(h => `
        <div class="hint">
            <strong>${esc(h.hint)}</strong><br>
            <small>${esc(h.reason)}</small>
        </div>
    `).join('')}
    ${summary.differentiationHints.length === 0 ? '<p style="color:#94a3b8;font-size:9pt;">2商品以上で共通する課題がないためヒントを生成できません</p>' : ''}

    <h2>📊 商品間比較</h2>
    <table>
        <thead>
            <tr>
                <th></th>
                ${summary.comparisonTable.map(p => `<th>${esc(p.productName.substring(0, 20))}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            <tr><td>価格</td>${summary.comparisonTable.map(p => `<td>¥${p.price.toLocaleString()}</td>`).join('')}</tr>
            <tr><td>評価</td>${summary.comparisonTable.map(p => `<td>⭐${p.rating}</td>`).join('')}</tr>
            ${(() => {
            const allAspects = new Set();
            summary.comparisonTable.forEach(p => Object.keys(p.aspects).forEach(a => allAspects.add(a)));
            return [...allAspects].map(aspect => `
                    <tr><td>${esc(aspect)}</td>${summary.comparisonTable.map(p => `<td>${sentimentEmoji[p.aspects[aspect] || 'neutral']}</td>`).join('')}</tr>
                `).join('');
        })()}
        </tbody>
    </table>

    ${analyses.map((pa, idx) => `
        <div class="${idx > 0 ? 'page-break' : ''}">
            <h2>🔍 個別分析: ${esc(pa.productInfo.name || '商品' + (idx + 1))}</h2>
            <p style="font-size:9pt;color:#64748b;">レビュー${pa.analysis.totalReviews}件 / 平均⭐${pa.analysis.averageRating}</p>

            <h3>アスペクト別評価</h3>
            <table>
                <thead><tr><th>アスペクト</th><th>😊</th><th>😠</th></tr></thead>
                <tbody>
                    ${pa.analysis.aspectMatrix.map(a => `
                        <tr><td>${esc(a.aspect)}</td><td style="color:#16a34a;">${a.positiveCount}</td><td style="color:#dc2626;">${a.negativeCount}</td></tr>
                    `).join('')}
                </tbody>
            </table>

            <h3>🔴 ネガティブ TOP5</h3>
            ${pa.analysis.topNegativeSentences.slice(0, 5).map((s, i) => `
                <div class="factor factor-neg">${i + 1}. 「${esc(s.sentence)}」<small>[${esc(s.aspect)}] ${s.count}件</small></div>
            `).join('')}

            <h3>🟢 ポジティブ TOP5</h3>
            ${pa.analysis.topPositiveSentences.slice(0, 5).map((s, i) => `
                <div class="factor factor-pos">${i + 1}. 「${esc(s.sentence)}」<small>[${esc(s.aspect)}] ${s.count}件</small></div>
            `).join('')}
        </div>
    `).join('')}

    <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

function csvEsc(str) {
    if (!str) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

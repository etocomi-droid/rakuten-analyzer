// ===== State =====
const state = {
    currentView: 'input',
    analysisData: null, // { products, analyses, summary }
    currentProductIndex: 0,
    currentFilter: 'all',
    detailData: null,
};

const API = '';
const $ = (id) => document.getElementById(id);

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

function setupEventListeners() {
    $('btn-analyze').addEventListener('click', () => startAnalysis($('url-input').value));
    $('btn-demo').addEventListener('click', () => startAnalysis(''));

    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab === 'input') {
                showView('input');
                $('tab-nav').classList.add('hidden');
            } else if (tab === 'summary') {
                showView('summary');
            } else if (tab === 'detail') {
                showView('detail');
            }
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

// ===== View Management =====
function showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $(viewName + '-view').classList.add('active');
    state.currentView = viewName;

    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === viewName);
    });
}

// ===== Analysis Flow =====
async function startAnalysis(urls) {
    showView('progress');
    $('tab-nav').classList.add('hidden');
    updateProgress(0, '分析を開始しています...');

    try {
        updateProgress(10, 'レビューを取得・分析しています...');

        const response = await fetch(`${API}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || '分析に失敗しました');
        }

        updateProgress(80, '結果を生成しています...');
        const data = await response.json();
        state.analysisData = data;

        updateProgress(100, '完了！');
        await sleep(500);

        // タブ表示
        $('tab-nav').classList.remove('hidden');

        // サマリ画面を表示
        renderSummary(data.summary, data.products);
        showView('summary');

        // 個別分析の初期表示
        renderProductSelector(data.products);
        loadProductDetail(0);

    } catch (err) {
        console.error('Analysis error:', err);
        showView('input');
        alert('分析エラー: ' + err.message);
    }
}

function updateProgress(percent, text) {
    $('progress-bar').style.width = percent + '%';
    $('progress-detail').textContent = text;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== Summary View =====
function renderSummary(summary, products) {
    // Header
    $('summary-header').innerHTML = `
        <h2>📊 クロス分析サマリ</h2>
        <div class="summary-badges">
            <span class="badge badge-category">カテゴリ: ${esc(summary.category)}</span>
            <span class="badge badge-price">価格帯: ¥${summary.priceRange.min.toLocaleString()}〜¥${summary.priceRange.max.toLocaleString()}</span>
            <span class="badge badge-count">${summary.productCount}商品 / ${summary.totalReviews}件のレビュー</span>
        </div>
    `;

    // Positive factors
    renderFactors($('positive-factors'), '🟢 評価が上がる要因', summary.positiveFactors, 'positive', summary.productCount);

    // Negative factors
    renderFactors($('negative-factors'), '🔴 評価が下がる要因', summary.negativeFactors, 'negative', summary.productCount);

    // Differentiation hints
    renderHints($('differentiation-hints'), summary.differentiationHints);

    // Comparison table
    renderComparisonTable($('comparison-table'), summary.comparisonTable);
}

function renderFactors(container, title, factors, type, totalProducts) {
    const maxCount = factors.length > 0 ? Math.max(...factors.map(f => f.totalCount)) : 1;

    container.innerHTML = `
        <h3>${title}</h3>
        ${factors.map((f, i) => `
            <div class="factor-item factor-${type}">
                <div class="factor-sentence">${i + 1}. 「${esc(f.sentence)}」</div>
                <div class="factor-meta">
                    <span class="aspect-tag aspect-tag-${type}">${esc(f.aspect)}</span>
                    <span>${f.totalCount}件</span>
                    <span>${f.products.length}/${totalProducts}商品で言及</span>
                </div>
                <div class="factor-bar">
                    <div class="factor-bar-fill ${type}" style="width: ${(f.totalCount / maxCount * 100).toFixed(0)}%"></div>
                </div>
            </div>
        `).join('')}
        ${factors.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem;">データがありません</p>' : ''}
    `;
}

function renderHints(container, hints) {
    container.innerHTML = `
        <h3>💡 差別化のヒント</h3>
        ${hints.map(h => `
            <div class="hint-item">
                <div class="hint-title">• ${esc(h.hint)}</div>
                <div class="hint-reason">${esc(h.reason)}</div>
                ${h.relatedNegative ? `<div class="hint-related">不満: 「${esc(h.relatedNegative)}」</div>` : ''}
                ${h.relatedRequest ? `<div class="hint-related">要望: 「${esc(h.relatedRequest)}」</div>` : ''}
            </div>
        `).join('')}
        ${hints.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem;">ヒントの生成には2商品以上で共通する課題が必要です</p>' : ''}
    `;
}

function renderComparisonTable(container, table) {
    if (!table || table.length === 0) {
        container.innerHTML = '';
        return;
    }

    // 全アスペクトを収集
    const allAspects = new Set();
    table.forEach(p => Object.keys(p.aspects).forEach(a => allAspects.add(a)));
    const aspects = [...allAspects];

    const emojiMap = { positive: '😊', negative: '😠', neutral: '😐' };
    const classMap = { positive: 'emoji-positive', negative: 'emoji-negative', neutral: 'emoji-neutral' };

    container.innerHTML = `
        <h3>📊 商品間比較テーブル</h3>
        <table class="comparison-table">
            <thead>
                <tr>
                    <th></th>
                    ${table.map((p, i) => `<th title="${esc(p.productName)}" style="cursor:pointer" onclick="window.__selectProduct(${i})">${esc(shortenName(p.productName))}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>総合評価</td>
                    ${table.map(p => `<td>⭐${p.rating}</td>`).join('')}
                </tr>
                ${aspects.map(aspect => `
                    <tr>
                        <td>${esc(aspect)}</td>
                        ${table.map(p => {
        const v = p.aspects[aspect] || 'neutral';
        return `<td><span class="${classMap[v]}">${emojiMap[v]}</span></td>`;
    }).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <p style="text-align:center;color:var(--text-muted);font-size:0.75rem;margin-top:8px;">商品名をクリックして個別分析を表示</p>
    `;
}

// Global function for comparison table clicks
window.__selectProduct = (index) => {
    loadProductDetail(index);
    showView('detail');
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'detail');
    });
};

// ===== Detail View =====
function renderProductSelector(products) {
    $('product-selector').innerHTML = products.map((p, i) => `
        <button class="product-tab ${i === 0 ? 'active' : ''}" data-index="${i}" title="${esc(p.name)}">
            ${esc(shortenName(p.name))}
        </button>
    `).join('');

    $('product-selector').querySelectorAll('.product-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            loadProductDetail(idx);
            $('product-selector').querySelectorAll('.product-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

async function loadProductDetail(index) {
    state.currentProductIndex = index;

    try {
        const res = await fetch(`${API}/api/product/${index}/details`);
        if (!res.ok) throw new Error('Failed to load details');
        const data = await res.json();
        state.detailData = data;
        renderDetail(data);

        // Update selector active state
        $('product-selector').querySelectorAll('.product-tab').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
        });
    } catch (err) {
        console.error('Detail load error:', err);
    }
}

function renderDetail(data) {
    const { productInfo, analysis } = data;

    // Aspect Matrix
    renderAspectMatrix(analysis.aspectMatrix, productInfo.name);

    // Negative ranking
    renderRanking($('negative-ranking'), '🔴 ここがダメ', analysis.topNegativeSentences, 'negative');

    // Positive ranking
    renderRanking($('positive-ranking'), '🟢 ここが良い', analysis.topPositiveSentences, 'positive');

    // Improvement requests
    renderRequests(analysis.improvementRequests);

    // All sentences
    renderSentences(analysis.allAnalyzedSentences);
}

function renderAspectMatrix(matrix, productName) {
    const container = $('aspect-matrix');
    if (!matrix || matrix.length === 0) {
        container.innerHTML = '<h3>📊 アスペクト別評価</h3><p style="color:var(--text-muted)">データがありません</p>';
        return;
    }

    container.innerHTML = `
        <h3>📊 アスペクト別評価 — ${esc(shortenName(productName))}</h3>
        <div style="margin-bottom:8px;">
            <div class="aspect-row" style="font-weight:600;font-size:0.75rem;color:var(--text-muted);cursor:default;">
                <div>観点</div>
                <div>良い ← → 悪い</div>
                <div style="text-align:center">😊</div>
                <div style="text-align:center">😠</div>
            </div>
        </div>
        ${matrix.map(a => {
        const total = a.positiveCount + a.negativeCount;
        const posPercent = total > 0 ? (a.positiveCount / total * 100) : 50;
        const negPercent = total > 0 ? (a.negativeCount / total * 100) : 50;
        return `
                <div class="aspect-row" onclick="window.__drilldown('${esc(a.aspect)}')">
                    <div class="aspect-name">${esc(a.aspect)}</div>
                    <div class="aspect-bar-container">
                        <div class="aspect-bar-pos" style="width:${posPercent}%">${posPercent > 15 ? a.positiveCount : ''}</div>
                        <div class="aspect-bar-neg" style="width:${negPercent}%">${negPercent > 15 ? a.negativeCount : ''}</div>
                    </div>
                    <div class="aspect-count aspect-count-pos">${a.positiveCount}</div>
                    <div class="aspect-count aspect-count-neg">${a.negativeCount}</div>
                </div>
            `;
    }).join('')}
        <p style="text-align:center;color:var(--text-muted);font-size:0.7rem;margin-top:8px;">観点をクリックで詳細表示</p>
    `;
}

// Drilldown
window.__drilldown = (aspect) => {
    if (!state.detailData) return;
    const sentences = state.detailData.analysis.allAnalyzedSentences
        .filter(s => s.aspect === aspect);

    const overlay = document.createElement('div');
    overlay.className = 'drilldown-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const positive = sentences.filter(s => s.sentiment === 'positive');
    const negative = sentences.filter(s => s.sentiment === 'negative');

    overlay.innerHTML = `
        <div class="drilldown-modal">
            <button class="drilldown-close" onclick="this.closest('.drilldown-overlay').remove()">✕</button>
            <h3>🔎 ${esc(aspect)} の詳細（${sentences.length}件）</h3>
            ${positive.length > 0 ? `
                <h4 style="color:var(--positive);margin:12px 0 8px;">😊 良い評価（${positive.length}件）</h4>
                ${positive.map(s => `
                    <div class="sentence-item positive">
                        <div class="sentence-text">「${esc(s.originalSentence)}」</div>
                    </div>
                `).join('')}
            ` : ''}
            ${negative.length > 0 ? `
                <h4 style="color:var(--negative);margin:12px 0 8px;">😠 悪い評価（${negative.length}件）</h4>
                ${negative.map(s => `
                    <div class="sentence-item negative">
                        <div class="sentence-text">「${esc(s.originalSentence)}」</div>
                    </div>
                `).join('')}
            ` : ''}
        </div>
    `;
    document.body.appendChild(overlay);
};

function renderRanking(container, title, items, type) {
    container.innerHTML = `
        <h3>${title}</h3>
        ${items.slice(0, 7).map((item, i) => `
            <div class="ranking-item factor-${type}">
                <span class="ranking-num ranking-num-${type}">${i + 1}</span>
                <span class="ranking-text">「${esc(item.sentence)}」</span>
                <span class="ranking-count">
                    <span class="aspect-tag aspect-tag-${type}">${esc(item.aspect)}</span>
                    ${item.count}件
                </span>
            </div>
        `).join('')}
        ${items.length === 0 ? `<p style="color:var(--text-muted);font-size:0.85rem;">データがありません</p>` : ''}
    `;
}

function renderRequests(requests) {
    const container = $('improvement-requests');
    container.innerHTML = `
        <h3>💡 改善要望</h3>
        ${requests.slice(0, 8).map(r => `
            <div class="request-item">
                <span class="request-text">「${esc(r.sentence)}」(${r.count}件)</span>
                <span class="request-aspect">${esc(r.aspect)}</span>
            </div>
        `).join('')}
        ${requests.length === 0 ? `<p style="color:var(--text-muted);font-size:0.85rem;">改善要望は検出されませんでした</p>` : ''}
    `;
}

function renderSentences(sentences) {
    const container = $('review-sentences');
    state.currentFilter = 'all';

    const render = (filter) => {
        let filtered = sentences;
        if (filter === 'positive') filtered = sentences.filter(s => s.sentiment === 'positive');
        else if (filter === 'negative') filtered = sentences.filter(s => s.sentiment === 'negative');
        else if (filter === 'request') filtered = sentences.filter(s => s.isRequest);

        const sentimentLabel = { positive: 'ポジティブ', negative: 'ネガティブ', neutral: 'ニュートラル' };
        const sentimentTagClass = { positive: 'tag-sentiment-positive', negative: 'tag-sentiment-negative', neutral: 'tag-sentiment-neutral' };

        container.innerHTML = `
            <h3>📝 レビュー文一覧（${filtered.length}/${sentences.length}件）</h3>
            <div class="filter-bar">
                <button class="filter-btn ${filter === 'all' ? 'active' : ''}" data-filter="all">全て</button>
                <button class="filter-btn ${filter === 'positive' ? 'active' : ''}" data-filter="positive">😊 ポジティブ</button>
                <button class="filter-btn ${filter === 'negative' ? 'active' : ''}" data-filter="negative">😠 ネガティブ</button>
                <button class="filter-btn ${filter === 'request' ? 'active' : ''}" data-filter="request">💡 要望</button>
            </div>
            ${filtered.slice(0, 50).map(s => `
                <div class="sentence-item ${s.sentiment}">
                    <div class="sentence-text">「${esc(s.originalSentence)}」</div>
                    <div class="sentence-tags">
                        ${s.subject ? `<span class="sentence-tag tag-subject">対象: ${esc(s.subject)}</span>` : ''}
                        <span class="sentence-tag tag-aspect">観点: ${esc(s.aspect)}</span>
                        <span class="sentence-tag ${sentimentTagClass[s.sentiment]}">${sentimentLabel[s.sentiment]}</span>
                        ${s.isRequest ? '<span class="sentence-tag tag-request">改善要望</span>' : ''}
                    </div>
                </div>
            `).join('')}
            ${filtered.length > 50 ? `<p style="color:var(--text-muted);text-align:center;">他 ${filtered.length - 50}件...</p>` : ''}
        `;

        // Re-attach filter listeners
        container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => render(btn.dataset.filter));
        });
    };

    render('all');
}

// ===== Utilities =====
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function shortenName(name) {
    if (!name) return '';
    return name.length > 25 ? name.substring(0, 25) + '...' : name;
}

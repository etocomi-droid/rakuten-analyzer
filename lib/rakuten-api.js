import fetch from 'node-fetch';

const BASE_URL = 'https://app.rakuten.co.jp/services/api';

/**
 * 楽天ジャンル検索API
 */
export async function searchGenres(appId, genreId = 0) {
    const url = `${BASE_URL}/IchibaGenre/Search/20140222?format=json&applicationId=${appId}&genreId=${genreId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Rakuten Genre API error: ${res.status}`);
    const data = await res.json();

    const current = data.current || {};
    const children = (data.children || []).map((c) => ({
        genreId: c.child.genreId,
        genreName: c.child.genreName,
        genreLevel: c.child.genreLevel,
    }));

    return { current, children };
}

/**
 * 楽天商品検索API
 */
export async function searchItems(appId, params = {}) {
    const query = new URLSearchParams({
        format: 'json',
        applicationId: appId,
        hits: params.hits || 30,
        page: params.page || 1,
        sort: params.sort || '-reviewCount',
        ...(params.genreId ? { genreId: params.genreId } : {}),
        ...(params.keyword ? { keyword: params.keyword } : {}),
        ...(params.hasReviewFlag ? { hasReviewFlag: 1 } : {}),
    });

    const url = `${BASE_URL}/IchibaItem/Search/20220601?${query}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Rakuten Item API error: ${res.status}`);
    const data = await res.json();

    const items = (data.Items || []).map((wrapper) => {
        const item = wrapper.Item;
        return {
            itemCode: item.itemCode,
            itemName: item.itemName,
            itemPrice: item.itemPrice,
            itemUrl: item.itemUrl,
            imageUrl: (item.mediumImageUrls && item.mediumImageUrls[0]?.imageUrl) || '',
            shopName: item.shopName,
            shopCode: item.shopCode,
            reviewCount: item.reviewCount || 0,
            reviewAverage: item.reviewAverage || 0,
            genreId: item.genreId,
        };
    });

    return {
        items,
        count: data.count || 0,
        page: data.page || 1,
        pageCount: data.pageCount || 0,
        hits: data.hits || 0,
    };
}

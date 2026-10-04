/**
 * 项目快照的 IndexedDB 存储。
 *
 * 项目动辄几 MB，localStorage 的 5MB 配额装不下；IndexedDB 的配额是浏览器按
 * 磁盘余量给的，宽裕得多。只有一个键 'last'：上次自动保存的快照。
 *   { json: <vm.toJSON() 的字符串>, savedAt: <时间戳>, assets: {assetId: svg 文本} }
 *
 * assets 是项目里那些**不在内置资产里的 SVG 造型**（AI 画的角色造型全走这里）：
 * vm.toJSON() 只有 JSON，资产得另外带上，否则读档时 storage 里找不到那份矢量图，
 * 造型会变成一片空白。老快照没有这个字段，读出来是 undefined，按「没有」处理。
 *
 * IndexedDB 打不开（隐私模式、配额被清等）时所有操作静默退化：存不上、读不到，
 * 不该因为它打断编辑器 —— 所以这里把一切错误都吞成 null / false。
 */
const DB_NAME = 'xce-projects';
const STORE = 'snapshots';
const KEY = 'last';

let dbPromise = null;

const openDb = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE)) {
                request.result.createObjectStore(STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('indexedDB blocked'));
    });
    // 失败后清掉缓存的 promise，下次操作还能再试（可能只是暂时被占用）
    dbPromise.catch(() => {
        dbPromise = null;
    });
    return dbPromise;
};

// 打开库 → 在 store 上跑一个请求；任何一步失败都 resolve(null)，不往外抛
const withStore = async (mode, run) => {
    let db;
    try {
        db = await openDb();
    } catch (e) {
        return null;
    }
    return new Promise(resolve => {
        let request;
        try {
            const tx = db.transaction(STORE, mode);
            request = run(tx.objectStore(STORE));
            tx.onabort = () => resolve(null);
        } catch (e) {
            resolve(null);
            return;
        }
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
};

/**
 * @param {string} json vm.toJSON() 的字符串
 * @param {number} savedAt 保存时间戳
 * @param {?Object<string, string>} assets assetId -> SVG 文本（没有就不带这个字段）
 * @returns {Promise<boolean>} 是否写成功
 */
export const saveSnapshot = (json, savedAt = Date.now(), assets = null) =>
    withStore('readwrite', store => store.put({json, savedAt, assets}, KEY))
        .then(result => result !== null);

export const loadSnapshot = () =>
    withStore('readonly', store => store.get(KEY))
        .then(result => (result && result.json ? result : null));

export const clearSnapshot = () =>
    withStore('readwrite', store => store.delete(KEY))
        .then(result => result !== null);

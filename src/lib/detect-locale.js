/**
 * @fileoverview
 * Utility function to detect locale from the browser setting or paramenter on the URL.
 */

import queryString from 'query-string';
import {getLocaleFromPath} from './locales-config.js';

// tw: read language from localStorage
export const LANGUAGE_KEY = 'tw:language';

/**
 * look for language setting in the browser. Check against supported locales.
 * If there's a parameter in the URL, override the browser setting
 * @param {Array.string} supportedLocales An array of supported locale codes.
 * @return {string} the preferred locale
 */
const detectLocale = supportedLocales => {
    // 优先级1: 从URL路径解析语言（如 /zh-CN/、/en-US/）
    const pathLocale = getLocaleFromPath(window.location.pathname);
    if (pathLocale && supportedLocales.includes(pathLocale)) {
        return pathLocale;
    }

    // 优先级2: 从localStorage读取
    try {
        const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
        if (storedLanguage && supportedLocales.includes(storedLanguage)) {
            return storedLanguage;
        }
    } catch (e) { /* ignore */ }

    // 优先级3: 从浏览器语言设置
    let locale = 'en'; // default
    let browserLocale = window.navigator.userLanguage || window.navigator.language;
    browserLocale = browserLocale.toLowerCase();
    // try to set locale from browserLocale
    if (supportedLocales.includes(browserLocale)) {
        locale = browserLocale;
    } else {
        browserLocale = browserLocale.split('-')[0];
        if (supportedLocales.includes(browserLocale)) {
            locale = browserLocale;
        }
    }

    // 优先级4: URL查询参数（兼容旧方式）
    const queryParams = queryString.parse(location.search);
    // Flatten potential arrays and remove falsy values
    const potentialLocales = [].concat(queryParams.locale, queryParams.lang).filter(l => l);
    if (potentialLocales.length) {
        const urlLocale = potentialLocales[0].toLowerCase();
        if (supportedLocales.includes(urlLocale)) {
            return urlLocale;
        }
    }

    return locale;
};

export {
    detectLocale
};

/**
 * 语言代码映射：scratch-l10n 内部代码 -> URL使用的BCP47代码
 * 用于多语言URL路由，如 /zh-CN/、/en-US/
 */

const localeMap = {
    'ab': 'ab',
    'af': 'af-ZA',
    'am': 'am-ET',
    'an': 'an-ES',
    'ar': 'ar-SA',
    'ast': 'ast-ES',
    'az': 'az-AZ',
    'be': 'be-BY',
    'bg': 'bg-BG',
    'bn': 'bn-BD',
    'ca': 'ca-ES',
    'ckb': 'ckb',
    'cs': 'cs-CZ',
    'cy': 'cy-GB',
    'da': 'da-DK',
    'de': 'de-DE',
    'el': 'el-GR',
    'en': 'en-US',
    'eo': 'eo',
    'es': 'es-ES',
    'es-419': 'es-419',
    'et': 'et-EE',
    'eu': 'eu-ES',
    'fa': 'fa-IR',
    'fi': 'fi-FI',
    'fil': 'fil-PH',
    'fr': 'fr-FR',
    'fy': 'fy-NL',
    'ga': 'ga-IE',
    'gd': 'gd-GB',
    'gl': 'gl-ES',
    'ha': 'ha-NG',
    'he': 'he-IL',
    'hi': 'hi-IN',
    'hr': 'hr-HR',
    'ht': 'ht-HT',
    'hu': 'hu-HU',
    'hy': 'hy-AM',
    'id': 'id-ID',
    'is': 'is-IS',
    'it': 'it-IT',
    'ja': 'ja-JP',
    'ja-Hira': 'ja-Hira',
    'ka': 'ka-GE',
    'kk': 'kk-KZ',
    'km': 'km-KH',
    'ko': 'ko-KR',
    'ku': 'ku',
    'lt': 'lt-LT',
    'lv': 'lv-LV',
    'mi': 'mi-NZ',
    'mn': 'mn-MN',
    'ms': 'ms-MY',
    'my': 'my-MM',
    'nb': 'nb-NO',
    'nl': 'nl-NL',
    'nn': 'nn-NO',
    'nso': 'nso-ZA',
    'oc': 'oc-FR',
    'or': 'or-IN',
    'pl': 'pl-PL',
    'pt': 'pt-PT',
    'pt-br': 'pt-BR',
    'qu': 'qu-PE',
    'rap': 'rap-CL',
    'ro': 'ro-RO',
    'ru': 'ru-RU',
    'sk': 'sk-SK',
    'sl': 'sl-SI',
    'sr': 'sr-RS',
    'sv': 'sv-SE',
    'sw': 'sw-KE',
    'th': 'th-TH',
    'tn': 'tn-ZA',
    'tr': 'tr-TR',
    'uk': 'uk-UA',
    'uz': 'uz-UZ',
    'vi': 'vi-VN',
    'xh': 'xh-ZA',
    'zh-cn': 'zh-CN',
    'zh-tw': 'zh-TW',
    'zu': 'zu-ZA'
};

// 获取所有支持的BCP47语言代码
const getSupportedLocales = () => Object.values(localeMap);

// 根据项目内部代码获取BCP47代码
const getBCP47Code = internalCode => localeMap[internalCode] || internalCode;

// 根据BCP47代码获取项目内部代码
const getInternalCode = bcp47Code => {
    const entry = Object.entries(localeMap).find(([, v]) => v === bcp47Code);
    return entry ? entry[0] : bcp47Code.toLowerCase();
};

// 从URL路径解析语言代码（返回内部代码）
const getLocaleFromPath = pathname => {
    const match = pathname.match(/^\/([a-zA-Z]{2}(?:-[a-zA-Z]{2,8})?)\//);
    if (match) {
        const bcp47Code = match[1];
        const internalCode = getInternalCode(bcp47Code);
        // 验证这个内部代码是否在我们的映射中
        if (localeMap[internalCode]) {
            return internalCode;
        }
    }
    return null;
};

// 语言本地化名称映射（供语言选择器显示用）
const localeNames = {};
Object.keys(localeMap).forEach(internalCode => {
    // 使用 BCP47 代码作为 key，方便 URL 路由使用
    localeNames[localeMap[internalCode]] = internalCode;
});

module.exports = {
    localeMap,
    getSupportedLocales,
    getBCP47Code,
    getInternalCode,
    getLocaleFromPath,
    localeNames
};

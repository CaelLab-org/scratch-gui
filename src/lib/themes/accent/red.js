/* XCE 默认强调色。
   内部 id 仍叫 "red"：换 id 会让存过主题设置的老用户回落到默认，得不偿失。
   主体用品牌蓝，外观类保留 Scratch 语义紫，红色只留给警告 / 错误 / 停止。 */
const guiColors = {
    'motion-primary': '#2b6fec',
    'motion-primary-transparent': '#2b6feccc',
    'motion-tertiary': '#1d5bd6',

    'looks-secondary': '#2b6fec',
    'looks-transparent': '#2b6fec59',
    'looks-light-transparent': '#2b6fec26',
    'looks-secondary-dark': '#1d5bd6',

    'extensions-primary': 'hsla(160, 50%, 35%, 1)',
    'extensions-tertiary': 'hsla(160, 50%, 25%, 1)',
    'extensions-transparent': 'hsla(160, 50%, 35%, 0.35)',
    'extensions-light': 'hsla(160, 35%, 75%, 1)',

    'drop-highlight': '#57a8ff',
    'menu-bar-background': '#2b6fec',
    'menu-bar-background-image': 'none',

    /* 平衡红 - 用于警告、错误、停止等 */
    'red-primary': 'hsla(350, 65%, 50%, 1)',
    'red-tertiary': 'hsla(350, 65%, 40%, 1)',
    'red-transparent': 'hsla(350, 65%, 50%, 0.35)'
};

const blockColors = {
    checkboxActiveBackground: '#2b6fec',
    checkboxActiveBorder: '#1d5bd6'
};

export {
    guiColors,
    blockColors
};

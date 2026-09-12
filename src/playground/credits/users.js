const shuffle = list => {
    for (let i = list.length - 1; i > 0; i--) {
        const random = Math.floor(Math.random() * (i + 1));
        const tmp = list[i];
        list[i] = list[random];
        list[random] = tmp;
    }
    return list;
};

// Self-hosted avatars (downloaded from trampoline.turbowarp.org)
const images = {
    '0': require('./avatars/0.png'),
    '1882674': require('./avatars/1882674.png'),
    '2561680': require('./avatars/2561680.png'),
    '3318598': require('./avatars/3318598.png'),
    '4648559': require('./avatars/4648559.png'),
    '5354974': require('./avatars/5354974.png'),
    '9636514': require('./avatars/9636514.png'),
    '9981676': require('./avatars/9981676.png'),
    '10817178': require('./avatars/10817178.png'),
    '11677378': require('./avatars/11677378.gif'),
    '12498592': require('./avatars/12498592.jpg'),
    '14792872': require('./avatars/14792872.png'),
    '14880401': require('./avatars/14880401.png'),
    '16426047': require('./avatars/16426047.png'),
    '16947341': require('./avatars/16947341.gif'),
    '17235330': require('./avatars/17235330.png'),
    '17340565': require('./avatars/17340565.png'),
    '19133274': require('./avatars/19133274.webp'),
    '20632822': require('./avatars/20632822.png'),
    '22529928': require('./avatars/22529928.png'),
    '26959223': require('./avatars/26959223.png'),
    '29118689': require('./avatars/29118689.png'),
    '29571977': require('./avatars/29571977.png'),
    '30323614': require('./avatars/30323614.png'),
    '33988895': require('./avatars/33988895.png'),
    '34018398': require('./avatars/34018398.png'),
    '34455896': require('./avatars/34455896.png'),
    '34824813': require('./avatars/34824813.png'),
    '37070511': require('./avatars/37070511.jpg'),
    '41219524': require('./avatars/41219524.jpg'),
    '41616512': require('./avatars/41616512.png'),
    '41876695': require('./avatars/41876695.png'),
    '45777723': require('./avatars/45777723.gif'),
    '52066199': require('./avatars/52066199.png'),
    '54392956': require('./avatars/54392956.png'),
    '55742784': require('./avatars/55742784.png'),
    '60000111': require('./avatars/60000111.jpg'),
    '61409215': require('./avatars/61409215.png'),
    '62325737': require('./avatars/62325737.png'),
    '62950341': require('./avatars/62950341.png'),
    '64184234': require('./avatars/64184234.png'),
    '64691048': require('./avatars/64691048.gif'),
    '72467731': require('./avatars/72467731.png'),
    '74246431': require('./avatars/74246431.jpg'),
    '80038021': require('./avatars/80038021.png'),
    '82486672': require('./avatars/82486672.png'),
    '103496265': require('./avatars/103496265.jpg'),
    '105362329': require('./avatars/105362329.gif'),
    '126715567': require('./avatars/126715567.png'),
    '128778351': require('./avatars/128778351.png'),
    '128887584': require('./avatars/128887584.png'),
    '129742989': require('./avatars/129742989.png'),
    '139929771': require('./avatars/139929771.png'),
    '141930175': require('./avatars/141930175.png'),
    '166646203': require('./avatars/166646203.png')
};

const fromHardcoded = ({userID = '0', username}) => {
    const result = {
        image: images[userID],
        text: username
    };
    if (username && userID !== '0') {
        result.href = `https://scratch.mit.edu/users/${username}/`;
    }
    return result;
};

// The lists below are in no particular order.

const contributors = [
    {
        userID: '41219524',
        username: 'CubesterYT'
    },
    {
        userID: '64691048',
        username: 'CST1229'
    },
    {
        userID: '128887584',
        username: 'FurryR'
    },
    {
        userID: '17340565',
        username: 'GarboMuffin'
    },
    {
        userID: '12498592',
        username: 'LilyMakesThings'
    },
    {
        userID: '105362329',
        username: 'TrueFantom'
    },
    {
        userID: '9636514',
        username: 'Tacodiva7729'
    },
    {
        userID: '141930175',
        username: 'SimonShiki'
    },
    {
        userID: '34824813',
        username: 'Geotale'
    },
    {
        username: 'Wowfunhappy'
    }
].map(fromHardcoded);

const addonDevelopers = [
    {
        userID: '34018398',
        username: 'Jeffalo'
    },
    {
        userID: '64184234',
        username: 'ErrorGamer2000'
    },
    {
        userID: '41616512',
        username: 'pufferfish101007'
    },
    {
        userID: '61409215',
        username: 'TheColaber'
    },
    {
        userID: '1882674',
        username: 'griffpatch'
    },
    {
        userID: '10817178',
        username: 'apple502j'
    },
    {
        userID: '16947341',
        username: '--Explosion--'
    },
    {
        userID: '14880401',
        username: 'Sheep_maker'
    },
    {
        userID: '9981676',
        username: 'NitroCipher'
    },
    {
        userID: '2561680',
        username: 'lisa_wolfgang'
    },
    {
        userID: '60000111',
        username: 'GDUcrash'
    },
    {
        userID: '4648559',
        username: 'World_Languages'
    },
    {
        userID: '17340565',
        username: 'GarboMuffin'
    },
    {
        userID: '5354974',
        username: 'Chrome_Cat'
    },
    {
        userID: '34455896',
        username: 'summerscar'
    },
    {
        userID: '55742784',
        username: 'RedGuy7'
    },
    {
        userID: '9636514',
        username: 'Tacodiva7729'
    },
    {
        userID: '14792872',
        username: '_nix'
    },
    {
        userID: '30323614',
        username: 'BarelySmooth'
    },
    {
        userID: '64691048',
        username: 'CST1229'
    },
    {
        username: 'DNin01'
    },
    {
        userID: '16426047',
        username: 'Maximouse'
    },
    {
        username: 'retronbv'
    },
    {
        username: 'GrahamSH'
    },
    {
        userID: '22529928',
        username: 'simiagain'
    },
    {
        username: 'Secret-chest'
    },
    {
        userID: '11677378',
        username: 'Mr_MPH'
    },
    {
        username: 'TheKodeToad'
    }
].map(fromHardcoded);

// generated by TurboWarp/extensions/scripts/get-credits-for-gui.js
const extensionDevelopers = [
    {
        username: '-SIPC-'
    },
    {
        username: '0832'
    },
    {
        userID: '17235330',
        username: 'aleb2005'
    },
    {
        userID: '129742989',
        username: 'BludIsAnLemon'
    },
    {
        username: 'BlueDome77'
    },
    {
        username: 'clay-rip'
    },
    {
        userID: '37070511',
        username: 'cs2627883'
    },
    {
        userID: '64691048',
        username: 'CST1229'
    },
    {
        userID: '41219524',
        username: 'CubesterYT'
    },
    {
        userID: '33988895',
        username: 'D-ScratchNinja'
    },
    {
        userID: '20632822',
        username: 'dogeiscut'
    },
    {
        username: 'DT'
    },
    {
        userID: '54392956',
        username: 'Fath11'
    },
    {
        userID: '1882674',
        username: 'griffpatch'
    },
    {
        userID: '41876695',
        username: 'JeremyGamer13'
    },
    {
        userID: '12498592',
        username: 'LilyMakesThings'
    },
    {
        userID: '29571977',
        username: 'man-o-valor'
    },
    {
        username: 'MikeDEV'
    },
    {
        userID: '74246431',
        username: '0znzw'
    },
    {
        userID: '62325737',
        username: 'mybearworld'
    },
    {
        userID: '62950341',
        username: 'NamelessCat'
    },
    {
        username: 'NishiOwO'
    },
    {
        username: 'NOname-awa'
    },
    {
        userID: '26959223',
        username: 'pinksheep2917'
    },
    {
        username: 'Pen-Group'
    },
    {
        username: 'pumpkinhasapatch'
    },
    {
        userID: '126715567',
        username: 'PwLDev'
    },
    {
        userID: '139929771',
        username: 'qxsck'
    },
    {
        userID: '29118689',
        username: 'RedMan13'
    },
    {
        userID: '80038021',
        username: 'RixTheTyrunt'
    },
    {
        userID: '45777723',
        username: 'DemonX5'
    },
    {
        userID: '14880401',
        username: 'Sheep_maker'
    },
    {
        userID: '103496265',
        username: 'shreder95ua'
    },
    {
        userID: '72467731',
        username: 'Skyhigh173'
    },
    {
        userID: '52066199',
        username: 'softed'
    },
    {
        userID: '166646203',
        username: 'Staevski_G'
    },
    {
        username: 'TheShovel'
    },
    {
        userID: '105362329',
        username: 'TrueFantom'
    },
    {
        userID: '19133274',
        username: 'Vadik1'
    },
    {
        username: 'veggiecan0419'
    },
    {
        userID: '82486672',
        username: 'lolecksdeehaha'
    },
    {
        userID: '3318598',
        username: 'plant2014'
    },
    {
        userID: '128778351',
        username: 'XmerOriginals'
    },
    {
        username: 'ZXMushroom63'
    }
].map(fromHardcoded);

const docs = [
    {
        userID: '12498592',
        username: 'LilyMakesThings'
    },
    {
        username: 'DNin01'
    },
    {
        username: 'Samq64'
    },
    {
        username: '61080GBA'
    },
    {
        username: 'adazem009'
    },
    {
        username: 'sajtosteszta32'
    },
    {
        username: 'yoyomonem'
    },
    {
        userID: '55742784',
        username: 'RedGuy7'
    },
    {
        username: '28klotlucas2'
    },
    {
        username: 'PPPDUD'
    },
    {
        username: 'BackThePortal'
    },
    {
        username: 'Naleksuh'
    }
].map(fromHardcoded);

export default {
    contributors: shuffle(contributors),
    addonDevelopers: shuffle(addonDevelopers),
    extensionDevelopers: shuffle(extensionDevelopers),
    docs: shuffle(docs)
};

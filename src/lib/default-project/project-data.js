import sharedMessages from '../shared-messages';

// use the default message if a translation function is not passed
const defaultTranslator = msgObj => msgObj.defaultMessage;

/**
 * Generate a localized version of the default project
 * @param {function} translateFunction a function to use for translating the default names
 * @return {object} the project data json for the default project
 */
const projectData = translateFunction => {
    const translator = translateFunction || defaultTranslator;
    return ({
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: {
                    // 舞台自带的默认变量，故意不本地化：人和 AI 都能一眼认出它不是用户建的
                    '`jEk@4|i[#Fk?(8x)AV.-XCE_default_variable': [
                        'XCE_default_variable',
                        0
                    ]
                },
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                        name: translator(sharedMessages.backdrop, {index: 1}),
                        md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 240,
                        rotationCenterY: 180
                    }
                ],
                sounds: [],
                volume: 100
            },
            {
                isStage: false,
                name: translator(sharedMessages.sprite, {index: 1}),
                variables: {},
                lists: {},
                broadcasts: {},
                blocks: {},
                comments: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: 'bf2245779eb39ddcacecccc606ed27d1',
                        name: translator(sharedMessages.costume, {index: 1}),
                        bitmapResolution: 1,
                        md5ext: 'bf2245779eb39ddcacecccc606ed27d1.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 40,
                        rotationCenterY: 46
                    }
                ],
                sounds: [],
                volume: 100,
                visible: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around'
            }
        ],
        meta: {
            semver: '3.0.0',
            vm: '0.1.0',
            agent: ''
        }
    });
};


export default projectData;

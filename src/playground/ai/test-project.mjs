// 无头测试用的最小空项目
export const emptyProject = (spriteName = 'Sprite1') => ({
  targets: [
    {
      isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
      comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0,
      tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
    },
    {
      isStage: false, name: spriteName, variables: {}, lists: {}, broadcasts: {}, blocks: {},
      comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1,
      visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false,
      rotationStyle: 'all around'
    }
  ],
  monitors: [],
  extensions: [],
  meta: {semver: '3.0.0', vm: '3.0.0', agent: 'xce-ai-test'}
});

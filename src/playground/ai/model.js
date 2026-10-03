/**
 * 模型接入点。
 *
 * 循环只依赖一个很窄的接口：{name, complete(messages, tools, {signal, onChunk}) -> {text, toolCalls}}。
 * 所以后端（API key 必须在服务端）只要按这个形状包一层就能接上，循环和工具一行都不用改。
 */

// 工具调用 id 生成
const callId = () => `call_${Math.random().toString(36)
    .slice(2, 10)}`;

// 本地脚本模型：按给定顺序吐出预设回复。
// 用途是「不接后端也能把整条链路跑通」——验证循环、工具、注入、运行是否真的工作。
// 返回值是同步对象，循环里 await 它一样成立；真实 provider 返回 Promise 即可。
export const createScriptedModel = (steps, {name = '本地演示模型'} = {}) => {
    let index = 0;
    return {
        name,
        scripted: true,
        complete (messages, tools, {onChunk = () => {}} = {}) {
            const step = steps[Math.min(index, steps.length - 1)];
            index++;
            if (typeof step === 'function') return step({messages, tools, onChunk});

            const text = step.text || '';
            // 模拟流式，好让 UI 的渲染路径和真实模型一致
            for (const char of text) onChunk({kind: 'text_delta', delta: char});
            return {
                text,
                toolCalls: (step.toolCalls || []).map(call => ({
                    id: callId(),
                    name: call.name,
                    input: call.input
                }))
            };
        }
    };
};

// 内置演示脚本：写一段「数到 10 并说出来」的积木，然后运行、读状态。
// 用来在没接后端时验证整条链路。
export const demoSteps = sprite => [
    {
        text: `我先在「${sprite}」里写一段：绿旗按下后把 x 从 0 数到 10，念出来，再记进列表。`,
        toolCalls: [{
            name: 'write_script',
            input: {
                sprite,
                text: `when green flag clicked
set [x v] to (0)
repeat (10)
  change [x v] by (1)
end
say (join [数到 ] (x))
add (x) to [log v]`
            }
        }]
    },
    {
        text: '写好了，跑一下看看结果对不对。',
        toolCalls: [{name: 'run_project', input: {seconds: 2}}]
    },
    {
        text: '再读一下状态确认。',
        toolCalls: [{name: 'read_state', input: {}}]
    },
    {
        text: '完成：x 跑到了 10，log 里也记下来了。积木已经落在编辑器里，可以直接拖动或修改。'
    }
];

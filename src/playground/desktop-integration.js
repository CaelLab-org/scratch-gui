/**
 * 桌面版（Electron 壳）桥接：把主进程的原生文件对话框实现成 File System Access API 的一个子集。
 *
 * GUI 里既有的两处消费点在**模块加载时**就会读全局的 showOpenFilePicker / showSaveFilePicker
 * （src/lib/sb-file-uploader-hoc.jsx、src/containers/sb3-downloader.jsx），
 * 所以这段必须抢在它们之前求值 —— 由 playground/import-first.js 在最前面引出。
 *
 * 网页版没有 window.EditorPreload，整段直接跳过，线上行为不变。
 *
 * 桥的另一个用处（AI 取网页，xce_read_online）**不在这里** —— 那个在调用时才判
 * window.EditorPreload（见 ai/online.js），这样无头测试里也能临时挂一个假的。
 */

const preload = window.EditorPreload;

if (preload) {
    const abortError = () => {
        const error = new Error('用户取消了文件选择');
        error.name = 'AbortError';
        return error;
    };

    const toBytes = chunk => {
        if (chunk instanceof Uint8Array) {
            return chunk;
        }
        if (chunk instanceof ArrayBuffer) {
            return new Uint8Array(chunk);
        }
        if (ArrayBuffer.isView(chunk)) {
            return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        }
        // 正常只会收到字节，别的类型原样递过去让主进程报错，别在这儿吞掉
        return chunk;
    };

    class DesktopFileHandle {
        constructor (id, name) {
            this.id = id;
            this.name = name;
        }
        async getFile () {
            const data = await preload.readFile(this.id);
            return new File([data], this.name);
        }
        createWritable () {
            const {id} = this;
            return {
                async write (chunk) {
                    await preload.writeFileChunk(id, toBytes(chunk));
                },
                async close () {
                    await preload.closeFile(id);
                },
                async abort () {
                    await preload.abortFile(id);
                }
            };
        }
    }

    window.showOpenFilePicker = async () => {
        const picked = await preload.pickOpenFile();
        if (!picked) {
            throw abortError();
        }
        return [new DesktopFileHandle(picked.id, picked.name)];
    };

    window.showSaveFilePicker = async options => {
        const picked = await preload.pickSaveFile(options && options.suggestedName);
        if (!picked) {
            throw abortError();
        }
        return new DesktopFileHandle(picked.id, picked.name);
    };
}

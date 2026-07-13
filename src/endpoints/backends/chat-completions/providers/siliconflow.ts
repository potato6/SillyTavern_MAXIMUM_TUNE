import { CHAT_COMPLETION_SOURCES, SILICONFLOW_ENDPOINT } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';
import type { ModelEntry } from '../types.js';

const API_SILICONFLOW = 'https://api.siliconflow.com/v1';
const API_SILICONFLOW_CN = 'https://api.siliconflow.cn/v1';

const base = createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.SILICONFLOW,
    defaultBase: API_SILICONFLOW,
    secretKey: SECRET_KEYS.SILICONFLOW,
    supportsReverseProxy: true,
    modelsPath: '/models?type=text&sub_type=chat',
});

/**
 * SiliconFlow has two endpoints: global and CN.
 * Route to the right base URL depending on req.body.siliconflow_endpoint.
 */
export default {
    ...base,

    async chat(req: import('express').Request, res: import('express').Response) {
        const target = req.body.siliconflow_endpoint === SILICONFLOW_ENDPOINT.CN
            ? API_SILICONFLOW_CN : API_SILICONFLOW;
        req.body.reverse_proxy = target;
        return base.chat(req, res);
    },

    async listModels(req: import('express').Request): Promise<ModelEntry[]> {
        const target = req.body.siliconflow_endpoint === SILICONFLOW_ENDPOINT.CN
            ? API_SILICONFLOW_CN : API_SILICONFLOW;
        req.body.reverse_proxy = target;
        return base.listModels(req);
    },
};

import type { SecretKeyDescriptor } from '../common/key-types.js';

export const MISC_KEYS: SecretKeyDescriptor[] = [
    { id: 'HORDE',                  label: 'AI Horde',                        category: 'misc' },
    { id: 'NOVEL',                  label: 'NovelAI',                         category: 'misc' },
    { id: 'NOMICAI',                label: 'NomicAI',                         category: 'misc' },
    { id: 'VERTEXAI_SERVICE_ACCOUNT', label: 'Google Vertex AI (Service Account)', category: 'misc', storageKey: 'vertexai_service_account_json' },
    { id: 'MINIMAX_GROUP_ID',       label: 'MiniMax Group ID',                category: 'misc', storageKey: 'minimax_group_id' },
    { id: 'VOLCENGINE_APP_ID',      label: 'Volcengine App ID',               category: 'misc', storageKey: 'volcengine_app_id' },
    { id: 'VOLCENGINE_ACCESS_KEY',  label: 'Volcengine Access Key',           category: 'misc', storageKey: 'volcengine_access_key' },
];

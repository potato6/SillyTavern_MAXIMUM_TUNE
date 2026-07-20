import type { SecretKeyDescriptor } from '../common/key-types.js';

export const SEARCH_KEYS: SecretKeyDescriptor[] = [
    { id: 'SERPAPI', label: 'SerpApi', category: 'search' },
    { id: 'SERPER',  label: 'Serper',  category: 'search' },
    { id: 'TAVILY',  label: 'Tavily',  category: 'search' },
];

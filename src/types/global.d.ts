/**
 * Global type declarations for missing JSDoc @typedef types.
 * These types are referenced across the codebase but were only defined
 * as JSDoc @typedef comments which TypeScript cannot resolve in strict mode.
 */

/** @see src/prompt-converters.ts */
type PromptNames = {
    charName: string;
    userName: string;
    groupNames: string[];
    startsWithGroupName: (message: string) => boolean;
};

/** @see src/charx.ts */
type CharXAsset = {
    type: string;
    name: string;
    ext: string;
    zipPath: string;
    order: number;
    storageCategory?: string;
    baseName?: string;
};

/** @see src/endpoints/characters.ts */
type Crop = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** @see src/endpoints/chats.ts */
type ChatMatchFunction = (textArray: string[]) => boolean;

/** @see src/endpoints/content-manager.ts */
type ContentItem = {
    id: string;
    name: string;
    type: string;
    [key: string]: any;
};

/** @see src/endpoints/image-metadata.ts */
type ThumbnailType = 'bg' | 'avatar' | 'persona';

/** @see src/endpoints/image-metadata.ts */
type ImageMetadata = {
    hash?: string;
    aspectRatio?: number;
    isAnimated?: boolean;
    dominantColor?: string;
    folderIds: string[];
    addedTimestamp?: number;
    thumbnailResolution?: number;
    mtime?: number;
};

/** @see src/endpoints/image-metadata.ts */
type MetadataIndex = {
    version: number;
    images: { [key: string]: ImageMetadata };
    folders: Array<{ id: string; name: string; thumbnailFile: string }>;
};

/** @see src/endpoints/tokenizers.ts */
type TokenizationHandler = {
    [key: string]: any;
};

/**
 * Module '@zeldafan0225/ai_horde' has no TypeScript declarations.
 * @see src/endpoints/horde.ts
 */
declare module '@zeldafan0225/ai_horde' {
    const aiHorde: any;
    export default aiHorde;
}

/**
 * Module '@agnai/sentencepiece-js' has no TypeScript declarations.
 * @see src/endpoints/tokenizers.ts
 */
declare module '@agnai/sentencepiece-js' {
    export class SentencePieceProcessor {
        load(path: string): Promise<void>;
        encodeIds(text: string): number[];
        decodeIds(ids: number[]): string;
        encodePieces(text: string): string[];
    }
}

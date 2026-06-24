/**
 * A specialized Map class that provides consistent data storage by performing deep cloning of values.
 * @template K, V
 * @augments Map<K, V>
 */
export class StructuredCloneMap extends Map {
    cloneOnGet: any;
    cloneOnSet: any;
    /**
     * Constructs a new StructuredCloneMap.
     * @param {object} options - Options for the map
     * @param {boolean} options.cloneOnGet - Whether to clone the value when getting it from the map
     * @param {boolean} options.cloneOnSet - Whether to clone the value when setting it in the map
     */
    constructor({ cloneOnGet, cloneOnSet } = { cloneOnGet: true, cloneOnSet: true }) {
        super();
        this.cloneOnGet = cloneOnGet;
        this.cloneOnSet = cloneOnSet;
    }

    /**
     * Adds a new element with a specified key and value to the Map. If an element with the same key already exists, the element will be updated.
     *
     * The set value will always be a deep clone of the provided value to provide consistent data storage.
     * @param {K} key - The key to set
     * @param {V} value - The value to set
     * @returns {this} The updated map
     */
    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    set(key, value) {
        if (!this.cloneOnSet) {
            return super.set(key, value);
        }

        const clonedValue = structuredClone(value);
        super.set(key, clonedValue);
        return this;
    }

    /**
     * Returns a specified element from the Map object.
     * If the value that is associated to the provided key is an object, then you will get a reference to that object and any change made to that object will effectively modify it inside the Map.
     *
     * The returned value will always be a deep clone of the cached value.
     * @param {K} key - The key to get the value for
     * @returns {V | undefined} Returns the element associated with the specified key. If no element is associated with the specified key, undefined is returned.
     */
    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    get(key) {
        if (!this.cloneOnGet) {
            return super.get(key);
        }

        const value = super.get(key);
        return structuredClone(value);
    }
}

// GenIdx: A reusable Generational Index allocator.
// Encodes (generation,index) into a 32-bit unsigned integer (default 16/16 split).
// Allows recycling of indices while preventing stale references via generation checks.

export class GenIdx {
  constructor({ indexBits = 16, genBits = 16 } = {}) {
    if (indexBits + genBits !== 32) {
      throw new Error('indexBits + genBits must equal 32');
    }
    this._INDEX_BITS = indexBits;
    this._GEN_BITS = genBits;
    this._INDEX_MASK = (1 << this._INDEX_BITS) - 1;
    this._GEN_MASK = (1 << this._GEN_BITS) - 1;

    this._array = []; // entries: { generation:number, alive:boolean }
    this._free = [];  // stack of free indices
    this._counter = 0; // next new index
  }

  _encode(index, generation) {
    return ((generation & this._GEN_MASK) << this._INDEX_BITS) | (index & this._INDEX_MASK);
  }

  _decode(idString) {
    const n = Number(idString) >>> 0;
    const index = n & this._INDEX_MASK;
    const generation = (n >>> this._INDEX_BITS) & this._GEN_MASK;
    return { index, generation };
  }

  // Allocate next ID (as string) reusing freed slots when possible
  next() {
    if (this._free.length) {
      const index = this._free.pop();
      const entry = this._array[index];
      entry.generation = (entry.generation + 1) & this._GEN_MASK;
      entry.alive = true;
      return String(this._encode(index, entry.generation) >>> 0);
    }
    const index = this._counter++;
    if (index > this._INDEX_MASK) {
      throw new Error(`Exceeded maximum index capacity (${this._INDEX_MASK + 1}) for generational IDs`);
    }
    this._array[index] = { generation: 0, alive: true };
    return String(this._encode(index, 0) >>> 0);
  }

  // Mark id dead; returns boolean success
  kill(idString) {
    const { index, generation } = this._decode(idString);
    const entry = this._array[index];
    if (!entry || !entry.alive || entry.generation !== generation) return false;
    entry.alive = false;
    this._free.push(index);
    return true;
  }

  // Validate a given idString is alive under current generation
  alive(idString) {
    const { index, generation } = this._decode(idString);
    const entry = this._array[index];
    return !!(entry && entry.alive && entry.generation === generation);
  }
}

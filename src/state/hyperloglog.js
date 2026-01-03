class HyperLogLog {
    constructor(precision = 10) {
        this.precision = precision;
        this.registerCount = 1 << precision;
        this.registers = new Uint8Array(this.registerCount);
        this.alphaMM = this._getAlpha() * this.registerCount * this.registerCount;
    }

    _getAlpha() {
        switch (this.precision) {
            case 4: return 0.673;
            case 5: return 0.697;
            case 6: return 0.709;
            default: return 0.7213 / (1 + 1.079 / this.registerCount);
        }
    }

    _hash(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h * 0x01000193) >>> 0;
        }
        return h;
    }

    _countLeadingZeros(value, maxBits) {
        if (value === 0) return maxBits;
        let count = 0;
        while ((value & (1 << (maxBits - 1 - count))) === 0 && count < maxBits) {
            count++;
        }
        return count;
    }

    add(item) {
        const hash = this._hash(item);
        const registerIndex = hash >>> (32 - this.precision);
        const remainingBits = hash << this.precision;
        const leadingZeros = this._countLeadingZeros(remainingBits, 32 - this.precision) + 1;

        if (leadingZeros > this.registers[registerIndex]) {
            this.registers[registerIndex] = leadingZeros;
        }
    }

    count() {
        let harmonicSum = 0;
        let zeroRegisters = 0;

        for (let i = 0; i < this.registerCount; i++) {
            harmonicSum += Math.pow(2, -this.registers[i]);
            if (this.registers[i] === 0) zeroRegisters++;
        }

        let estimate = this.alphaMM / harmonicSum;

        if (estimate <= 2.5 * this.registerCount && zeroRegisters > 0) {
            estimate = this.registerCount * Math.log(this.registerCount / zeroRegisters);
        }

        return Math.round(estimate);
    }
}

module.exports = { HyperLogLog };

const secrets = require('secrets.js-grempe');

/**
 * Javascript Class to interact with SSS
 */
module.exports = class Shamir {
  /**
   * New Blockchain KeyPair.
   *
   * @returns {object} Key pair
   */
  static newSharedKeys(secret, max = 3, threshold = 2) {
    const pwHex = secrets.str2hex(secret); // => hex string
    const shares = secrets.share(pwHex, max, threshold);
    return shares;
  }

  /**
   * Combine keys to get the seed
   *
   * @param {string} skey1 Shared Key 1
   * @param {string} skey2 Shared Key 2
   * @returns {string} Seed
   */
  static getSeedFromSharedKeys(skey1, skey2) {
    const seed = secrets.combine([skey1, skey2]);
    return secrets.hex2str(seed);
  }

  /**
   * Get shared key
   *
   * @param {integer} shared index we want to recover
   * @param {string} skey1 Shared Key 1
   * @param {string} skey2 Shared Key 2
   * @returns {string} Recovered shared key
   */
  static getSharedKey(index, skey, skey2) {
    const share = secrets.newShare(index, [skey, skey2]);
    return share;
  }
};

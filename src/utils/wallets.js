const fs = require('fs');
const path = require('path');
// Utils
const Near = require('./near');

/**
 * Javascript Class to interact with SSS
 */
module.exports = class Wallets {
  
  /**
   * Init Near masterwallet
   */
  static async initNearWallet(network, walletIndex) {
    const jsonFile = path.resolve(HOMEMK, `wallet.${network}.${walletIndex}.json`);
    if (!fs.existsSync(jsonFile)) {
      const result = await Near.addWallet(network, 2, 2, null, '5');
      if (!result.success) {
        console.log(result.error);
        return;
      }
      const { shamir, address, accountId } = result;
      const json = { shamir, address, accountId };
      fs.writeFileSync(jsonFile, encrypt(JSON.stringify(json)));
    }
  }
};
